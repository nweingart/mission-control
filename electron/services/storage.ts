import { app, shell } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, renameSync, unlinkSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

// Max file size for JSON reads (50MB) to prevent memory exhaustion from corrupted files
const MAX_JSON_FILE_SIZE = 50 * 1024 * 1024;

import type { Config, Project, Task, ChatMessage, BacklogItem, Sprint, PlanningChat, GitEvent, DeploymentRecord, GapFinding, GapAnalysis, GamificationStats, FeatureModule, CodeIssue, ScanSnapshot } from '../../src/types/index';

export class StorageService {
  private appDir: string;
  private projectsDir: string;
  private configPath: string;
  private defaultDevelopmentPath: string;

  constructor() {
    const homeDir = app.getPath('home');
    this.appDir = join(homeDir, '.mission-control');

    // Migrate legacy ~/.houston → ~/.mission-control
    const legacyDir = join(homeDir, '.houston');
    if (existsSync(legacyDir) && !existsSync(this.appDir)) {
      renameSync(legacyDir, this.appDir);
    }

    this.projectsDir = join(this.appDir, 'projects');
    this.configPath = join(this.appDir, 'config.json');
    this.defaultDevelopmentPath = join(homeDir, 'development');

    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!existsSync(this.appDir)) {
      mkdirSync(this.appDir, { recursive: true });
    }
    if (!existsSync(this.projectsDir)) {
      mkdirSync(this.projectsDir, { recursive: true });
    }
  }

  // Windows reserved file names that cannot be used as slugs
  private static readonly WINDOWS_RESERVED_NAMES = new Set([
    'con', 'prn', 'aux', 'nul',
    'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
    'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
  ]);

  /**
   * Safely parse JSON with error handling and backup recovery
   * Returns null if parsing fails and backup recovery also fails
   */
  private safeJsonParse<T>(content: string, filePath: string): T | null {
    if (content.length > MAX_JSON_FILE_SIZE) {
      console.error(`File too large to parse (${(content.length / 1024 / 1024).toFixed(1)}MB): ${filePath}`);
      return null;
    }
    try {
      return JSON.parse(content) as T;
    } catch (error) {
      console.error(`Failed to parse JSON file: ${filePath}`, error);

      // Try to recover from backup if it exists
      const backupPath = `${filePath}.bak`;
      if (existsSync(backupPath)) {
        try {
          const backupContent = readFileSync(backupPath, 'utf-8');
          const recovered = JSON.parse(backupContent) as T;
          console.log(`Recovered data from backup: ${backupPath}`);
          // Restore the main file from backup
          this.atomicWriteFile(filePath, backupContent);
          return recovered;
        } catch (backupError) {
          console.error(`Failed to recover from backup: ${backupPath}`, backupError);
        }
      }

      return null;
    }
  }

  /**
   * Create a backup of a file before modifying it
   */
  private createBackup(filePath: string): void {
    if (existsSync(filePath)) {
      const backupPath = `${filePath}.bak`;
      try {
        const content = readFileSync(filePath, 'utf-8');
        writeFileSync(backupPath, content, 'utf-8');
      } catch (err) {
        console.error(`Failed to create backup of ${filePath}:`, err);
      }
    }
  }

  /**
   * Atomically write content to a file using temp file + rename.
   * This prevents data corruption if the write is interrupted.
   */
  private atomicWriteFile(filePath: string, content: string): void {
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    const dir = dirname(filePath);

    // Ensure directory exists
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    try {
      // Write to temp file first
      writeFileSync(tempPath, content, 'utf-8');

      // Atomically rename temp file to target
      renameSync(tempPath, filePath);
    } catch (err) {
      // Clean up temp file if it exists
      try {
        if (existsSync(tempPath)) {
          unlinkSync(tempPath);
        }
      } catch (cleanupErr) {
        console.error('Error cleaning up temp file:', cleanupErr);
      }
      throw err;
    }
  }

  // Helper to expand ~ to actual home directory
  private expandPath(path: string): string {
    if (path.startsWith('~/')) {
      return join(homedir(), path.slice(2));
    }
    if (path === '~') {
      return homedir();
    }
    return path;
  }

  // Config methods
  getConfig(): Config {
    const defaultConfig: Config = {
      developmentPath: this.defaultDevelopmentPath,
      theme: 'light',
    };

    if (!existsSync(this.configPath)) {
      this.saveConfig(defaultConfig);
      return defaultConfig;
    }

    const content = readFileSync(this.configPath, 'utf-8');
    const config = this.safeJsonParse<Config>(content, this.configPath);

    // Return default config if parsing failed or wrong shape
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      this.saveConfig(defaultConfig);
      return defaultConfig;
    }

    // Expand ~ in developmentPath
    if (config.developmentPath) {
      config.developmentPath = this.expandPath(config.developmentPath);
    }

    return config;
  }

  saveConfig(config: Config): void {
    this.atomicWriteFile(this.configPath, JSON.stringify(config, null, 2));
  }

  // Project methods
  listProjects(): Project[] {
    if (!existsSync(this.projectsDir)) {
      return [];
    }

    const slugs = readdirSync(this.projectsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    const projects: Project[] = [];
    for (const slug of slugs) {
      const project = this.getProject(slug);
      if (project) {
        projects.push(project);
      }
    }

    // Sort by creation date, newest first
    return projects.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getProject(slug: string): Project | null {
    const metaPath = join(this.projectsDir, slug, 'meta.json');
    if (!existsSync(metaPath)) {
      return null;
    }

    const content = readFileSync(metaPath, 'utf-8');
    const project = this.safeJsonParse<Project>(content, metaPath);
    return (project && typeof project === 'object' && !Array.isArray(project)) ? project : null;
  }

  createProject(name: string, idea: string): Project {
    const slug = this.generateSlug(name);
    const config = this.getConfig();
    const projectPath = join(config.developmentPath, slug);

    const project: Project = {
      slug,
      name,
      status: 'idea',
      createdAt: new Date().toISOString(),
      projectPath,
      githubRepo: '',
      scanStatus: 'pending',
      idea,
    };

    // Create project directory in app storage
    const projectDataDir = join(this.projectsDir, slug);
    mkdirSync(projectDataDir, { recursive: true });

    // Create project directory in development folder
    mkdirSync(projectPath, { recursive: true });

    // Save meta.json atomically
    const metaPath = join(projectDataDir, 'meta.json');
    this.atomicWriteFile(metaPath, JSON.stringify(project, null, 2));

    // Initialize empty tasks.json
    this.saveTasks(slug, []);

    // Mark free project as used
    if (!config.freeProjectUsed) {
      this.saveConfig({ ...config, freeProjectUsed: true });
    }

    return project;
  }

  updateProject(slug: string, updates: Partial<Project>): Project {
    const project = this.getProject(slug);
    if (!project) {
      throw new Error(`Project not found: ${slug}`);
    }

    const updated = { ...project, ...updates };
    const metaPath = join(this.projectsDir, slug, 'meta.json');
    // Create backup before updating
    this.createBackup(metaPath);
    this.atomicWriteFile(metaPath, JSON.stringify(updated, null, 2));

    return updated;
  }

  async deleteProject(slug: string, deleteGeneratedCode: boolean = true): Promise<void> {
    // Get project info first to find the generated code path
    const project = this.getProject(slug);

    // Move generated code directory to Trash if requested and project exists
    if (deleteGeneratedCode && project?.projectPath) {
      if (existsSync(project.projectPath)) {
        try {
          await shell.trashItem(project.projectPath);
        } catch (error) {
          console.error(`Failed to trash project folder at ${project.projectPath}:`, error);
        }
      }
    }

    // Delete app metadata directory (internal data, not user files)
    const projectDir = join(this.projectsDir, slug);
    if (existsSync(projectDir)) {
      rmSync(projectDir, { recursive: true, force: true });
    }
  }

  // Tasks methods
  getTasks(slug: string): Task[] {
    const tasksPath = join(this.projectsDir, slug, 'tasks.json');
    if (!existsSync(tasksPath)) {
      return [];
    }

    const content = readFileSync(tasksPath, 'utf-8');
    const tasks = this.safeJsonParse<Task[]>(content, tasksPath);
    return Array.isArray(tasks) ? tasks : [];
  }

  saveTasks(slug: string, tasks: Task[]): void {
    const tasksPath = join(this.projectsDir, slug, 'tasks.json');
    // Create backup before saving
    this.createBackup(tasksPath);
    this.atomicWriteFile(tasksPath, JSON.stringify(tasks, null, 2));
  }

  // PRD methods
  getPRD(slug: string): string | null {
    const prdPath = join(this.projectsDir, slug, 'prd.md');
    if (!existsSync(prdPath)) {
      return null;
    }

    return readFileSync(prdPath, 'utf-8');
  }

  savePRD(slug: string, prd: string): void {
    const prdPath = join(this.projectsDir, slug, 'prd.md');
    this.atomicWriteFile(prdPath, prd);
  }

  // Chat history methods
  getChatHistory(slug: string): ChatMessage[] {
    const chatPath = join(this.projectsDir, slug, 'chat.json');
    if (!existsSync(chatPath)) {
      return [];
    }

    const content = readFileSync(chatPath, 'utf-8');
    const messages = this.safeJsonParse<ChatMessage[]>(content, chatPath);
    return Array.isArray(messages) ? messages : [];
  }

  saveChatHistory(slug: string, messages: ChatMessage[]): void {
    const chatPath = join(this.projectsDir, slug, 'chat.json');
    // Create backup before saving
    this.createBackup(chatPath);
    this.atomicWriteFile(chatPath, JSON.stringify(messages, null, 2));
  }

  // Backlog methods
  getBacklog(slug: string): BacklogItem[] {
    const backlogPath = join(this.projectsDir, slug, 'backlog.json');
    if (!existsSync(backlogPath)) {
      return [];
    }

    const content = readFileSync(backlogPath, 'utf-8');
    const items = this.safeJsonParse<BacklogItem[]>(content, backlogPath);
    return Array.isArray(items) ? items : [];
  }

  saveBacklog(slug: string, items: BacklogItem[]): void {
    const backlogPath = join(this.projectsDir, slug, 'backlog.json');
    // Create backup before saving
    this.createBackup(backlogPath);
    this.atomicWriteFile(backlogPath, JSON.stringify(items, null, 2));
  }

  // Sprints methods
  getSprints(slug: string): Sprint[] {
    const sprintsPath = join(this.projectsDir, slug, 'sprints.json');
    if (!existsSync(sprintsPath)) {
      return [];
    }

    const content = readFileSync(sprintsPath, 'utf-8');
    const sprints = this.safeJsonParse<Sprint[]>(content, sprintsPath);
    return Array.isArray(sprints) ? sprints : [];
  }

  saveSprints(slug: string, sprints: Sprint[]): void {
    const sprintsPath = join(this.projectsDir, slug, 'sprints.json');
    this.createBackup(sprintsPath);
    this.atomicWriteFile(sprintsPath, JSON.stringify(sprints, null, 2));
  }

  // Planning chats methods
  getPlanningChats(slug: string): PlanningChat[] {
    const chatsPath = join(this.projectsDir, slug, 'planning-chats.json');
    if (!existsSync(chatsPath)) {
      return [];
    }

    const content = readFileSync(chatsPath, 'utf-8');
    const chats = this.safeJsonParse<PlanningChat[]>(content, chatsPath);
    return Array.isArray(chats) ? chats : [];
  }

  savePlanningChats(slug: string, chats: PlanningChat[]): void {
    const chatsPath = join(this.projectsDir, slug, 'planning-chats.json');
    // Create backup before saving
    this.createBackup(chatsPath);
    this.atomicWriteFile(chatsPath, JSON.stringify(chats, null, 2));
  }

  // Git events methods
  getGitEvents(slug: string): GitEvent[] {
    const eventsPath = join(this.projectsDir, slug, 'git-events.json');
    if (!existsSync(eventsPath)) {
      return [];
    }

    const content = readFileSync(eventsPath, 'utf-8');
    const events = this.safeJsonParse<GitEvent[]>(content, eventsPath);
    return Array.isArray(events) ? events : [];
  }

  saveGitEvents(slug: string, events: GitEvent[]): void {
    const eventsPath = join(this.projectsDir, slug, 'git-events.json');
    this.createBackup(eventsPath);
    this.atomicWriteFile(eventsPath, JSON.stringify(events, null, 2));
  }

  // Deployment records methods
  getDeployments(slug: string): DeploymentRecord[] {
    const deploymentsPath = join(this.projectsDir, slug, 'deployments.json');
    if (!existsSync(deploymentsPath)) return [];
    const content = readFileSync(deploymentsPath, 'utf-8');
    const deployments = this.safeJsonParse<DeploymentRecord[]>(content, deploymentsPath);
    return Array.isArray(deployments) ? deployments : [];
  }

  saveDeployments(slug: string, deployments: DeploymentRecord[]): void {
    const deploymentsPath = join(this.projectsDir, slug, 'deployments.json');
    this.createBackup(deploymentsPath);
    this.atomicWriteFile(deploymentsPath, JSON.stringify(deployments, null, 2));
  }

  // Gap analysis methods
  getGapAnalysis(slug: string): GapAnalysis[] {
    const path = join(this.projectsDir, slug, 'gap-analysis.json');
    if (!existsSync(path)) return [];
    const content = readFileSync(path, 'utf-8');
    const analyses = this.safeJsonParse<GapAnalysis[]>(content, path);
    return Array.isArray(analyses) ? analyses : [];
  }

  saveGapAnalysis(slug: string, analyses: GapAnalysis[]): void {
    const path = join(this.projectsDir, slug, 'gap-analysis.json');
    this.createBackup(path);
    this.atomicWriteFile(path, JSON.stringify(analyses, null, 2));
  }

  // Gamification methods
  getGamification(slug: string): GamificationStats | null {
    const path = join(this.projectsDir, slug, 'gamification.json');
    if (!existsSync(path)) return null;
    const content = readFileSync(path, 'utf-8');
    const stats = this.safeJsonParse<GamificationStats>(content, path);
    return (stats && typeof stats === 'object' && !Array.isArray(stats)) ? stats : null;
  }

  saveGamification(slug: string, stats: GamificationStats): void {
    const path = join(this.projectsDir, slug, 'gamification.json');
    this.createBackup(path);
    this.atomicWriteFile(path, JSON.stringify(stats, null, 2));
  }

  // V2: Features methods
  getFeatures(slug: string): FeatureModule[] {
    const featuresPath = join(this.projectsDir, slug, 'features.json');
    if (!existsSync(featuresPath)) {
      return [];
    }
    const content = readFileSync(featuresPath, 'utf-8');
    const features = this.safeJsonParse<FeatureModule[]>(content, featuresPath);
    return Array.isArray(features) ? features : [];
  }

  saveFeatures(slug: string, features: FeatureModule[]): void {
    const featuresPath = join(this.projectsDir, slug, 'features.json');
    this.createBackup(featuresPath);
    this.atomicWriteFile(featuresPath, JSON.stringify(features, null, 2));
  }

  // V2: Issues methods
  getIssues(slug: string): CodeIssue[] {
    const issuesPath = join(this.projectsDir, slug, 'issues.json');
    if (!existsSync(issuesPath)) {
      return [];
    }
    const content = readFileSync(issuesPath, 'utf-8');
    const issues = this.safeJsonParse<CodeIssue[]>(content, issuesPath);
    return Array.isArray(issues) ? issues : [];
  }

  saveIssues(slug: string, issues: CodeIssue[]): void {
    const issuesPath = join(this.projectsDir, slug, 'issues.json');
    this.createBackup(issuesPath);
    this.atomicWriteFile(issuesPath, JSON.stringify(issues, null, 2));
  }

  // V2: Scan history methods
  getScanHistory(slug: string): ScanSnapshot[] {
    const scanPath = join(this.projectsDir, slug, 'scan-history.json');
    if (!existsSync(scanPath)) {
      return [];
    }
    const content = readFileSync(scanPath, 'utf-8');
    const snapshots = this.safeJsonParse<ScanSnapshot[]>(content, scanPath);
    return Array.isArray(snapshots) ? snapshots : [];
  }

  saveScanHistory(slug: string, snapshots: ScanSnapshot[]): void {
    const scanPath = join(this.projectsDir, slug, 'scan-history.json');
    this.createBackup(scanPath);
    this.atomicWriteFile(scanPath, JSON.stringify(snapshots, null, 2));
  }

  // V2: Import a project from an existing repo
  importProject(name: string, githubRepo: string, projectPath: string): Project {
    const slug = this.generateSlug(name);

    const project: Project = {
      slug,
      name,
      createdAt: new Date().toISOString(),
      projectPath,
      githubRepo,
      scanStatus: 'pending',
    };

    // Create project directory in app storage
    const projectDataDir = join(this.projectsDir, slug);
    mkdirSync(projectDataDir, { recursive: true });

    // Save meta.json atomically
    const metaPath = join(projectDataDir, 'meta.json');
    this.atomicWriteFile(metaPath, JSON.stringify(project, null, 2));

    // Initialize empty collections
    this.saveTasks(slug, []);
    this.saveFeatures(slug, []);
    this.saveIssues(slug, []);
    this.saveScanHistory(slug, []);

    return project;
  }

  // Helper methods
  private generateSlug(name: string): string {
    let baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Handle empty slug
    if (!baseSlug) {
      baseSlug = 'project';
    }

    // Check for Windows reserved names and add suffix if needed
    if (StorageService.WINDOWS_RESERVED_NAMES.has(baseSlug)) {
      baseSlug = `${baseSlug}-project`;
    }

    // Check for existing slugs and add number if needed
    const existing = readdirSync(this.projectsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    if (!existing.includes(baseSlug)) {
      return baseSlug;
    }

    let counter = 2;
    while (existing.includes(`${baseSlug}-${counter}`)) {
      counter++;
    }

    return `${baseSlug}-${counter}`;
  }
}
