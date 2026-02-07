import type { CLIStatus, Project, Task, Config, ChatMessage, BacklogItem, PlanningChat, GitEvent, DeploymentRecord } from './index';

export interface ElectronAPI {
  // Storage
  storage: {
    getConfig: () => Promise<Config>;
    saveConfig: (config: Config) => Promise<void>;
    listProjects: () => Promise<Project[]>;
    getProject: (slug: string) => Promise<Project | null>;
    createProject: (name: string, idea: string) => Promise<Project>;
    updateProject: (slug: string, updates: Partial<Project>) => Promise<Project>;
    deleteProject: (slug: string) => Promise<void>;
    getTasks: (slug: string) => Promise<Task[]>;
    saveTasks: (slug: string, tasks: Task[]) => Promise<void>;
    getPRD: (slug: string) => Promise<string | null>;
    savePRD: (slug: string, prd: string) => Promise<void>;
    getChatHistory: (slug: string) => Promise<ChatMessage[]>;
    saveChatHistory: (slug: string, messages: ChatMessage[]) => Promise<void>;
    getBacklog: (slug: string) => Promise<BacklogItem[]>;
    saveBacklog: (slug: string, items: BacklogItem[]) => Promise<void>;
    getPlanningChats: (slug: string) => Promise<PlanningChat[]>;
    savePlanningChats: (slug: string, chats: PlanningChat[]) => Promise<void>;
    getGitEvents: (slug: string) => Promise<GitEvent[]>;
    saveGitEvents: (slug: string, events: GitEvent[]) => Promise<void>;
    getDeployments: (slug: string) => Promise<DeploymentRecord[]>;
    saveDeployments: (slug: string, deployments: DeploymentRecord[]) => Promise<void>;
  };

  // CLI Check
  cli: {
    checkAll: () => Promise<CLIStatus>;
    checkClaude: () => Promise<{ installed: boolean; authenticated: boolean }>;
    checkClaudeDeep: () => Promise<{ installed: boolean; authenticated: boolean }>;
    checkGitHub: () => Promise<{ installed: boolean; authenticated: boolean }>;
    checkVercel: () => Promise<{ installed: boolean; authenticated: boolean }>;
    checkSupabase: () => Promise<{ installed: boolean; authenticated: boolean }>;
    saveVercelToken: (token: string) => Promise<{ success: boolean }>;
  };

  // Claude Code
  claude: {
    spawn: (projectPath: string, prompt: string) => Promise<string>;
    spawnInteractive: (projectPath: string) => Promise<string>;
    chat: (projectPath: string, prompt: string) => Promise<string>;
    onOutput: (callback: (data: { sessionId: string; type: 'stdout' | 'stderr'; content: string }) => void) => void;
    onChatOutput: (callback: (content: string) => void) => void;
    onExit: (callback: (data: { sessionId: string; code: number }) => void) => void;
    sendInput: (sessionId: string, input: string) => Promise<void>;
    resize: (sessionId: string, cols: number, rows: number) => Promise<void>;
    kill: (sessionId: string) => Promise<void>;
    enableCompletionDetection: (sessionId: string) => Promise<void>;
    resetCompletionDetection: (sessionId: string) => Promise<void>;
    confirmCompletion: (sessionId: string) => Promise<void>;
    onCompletionDetected: (callback: (data: { sessionId: string }) => void) => void;
    removeListeners: () => void;
  };

  // Vercel
  vercel: {
    deploy: (projectPath: string, envVars?: Record<string, string>) => Promise<{ url: string; projectId: string }>;
    onOutput: (callback: (data: { type: 'stdout' | 'stderr'; content: string }) => void) => void;
    removeListeners: () => void;
  };

  // GitHub
  github: {
    checkGitStatus: (projectPath: string) => Promise<{ hasGitRepo: boolean; hasRemote: boolean; remoteUrl: string; isDirty: boolean }>;
    gitInit: (projectPath: string) => Promise<void>;
    ensureGitignore: (projectPath: string) => Promise<void>;
    ensureGitConfig: (projectPath: string, username: string) => Promise<void>;
    gitAddAndCommit: (projectPath: string, message: string) => Promise<{ commitHash: string; isNewCommit: boolean }>;
    createRepoAndPush: (projectPath: string, name: string) => Promise<{ repoUrl: string; githubUsername: string }>;
    gitPush: (projectPath: string) => Promise<void>;
    getUsername: () => Promise<string>;
    resetWorkingTree: (projectPath: string) => Promise<void>;
    getCurrentBranch: (projectPath: string) => Promise<string>;
    createAndCheckoutBranch: (projectPath: string, branchName: string) => Promise<void>;
    checkoutBranch: (projectPath: string, branchName: string) => Promise<void>;
    mergeBranch: (projectPath: string, branchName: string) => Promise<void>;
    renameBranch: (projectPath: string, newName: string) => Promise<void>;
    deleteBranch: (projectPath: string, branchName: string) => Promise<void>;
    getDiff: (projectPath: string, base?: string) => Promise<string>;
    getDiffStat: (projectPath: string, base: string) => Promise<string>;
    onOutput: (callback: (data: { type: 'stdout' | 'stderr'; content: string }) => void) => void;
    removeListeners: () => void;
  };

  // Supabase
  supabase: {
    createProject: (name: string) => Promise<{ ref: string; url: string; anonKey: string; serviceKey: string }>;
    runMigrations: (projectPath: string, supabaseRef: string) => Promise<void>;
    onOutput: (callback: (data: { type: 'stdout' | 'stderr'; content: string }) => void) => void;
    removeListeners: () => void;
  };

  // Dialog
  dialog: {
    selectDirectory: (defaultPath?: string) => Promise<string | null>;
  };

  // File System (limited operations)
  fs: {
    readdir: (path: string) => Promise<string[]>;
    writeFile: (filePath: string, content: string) => Promise<void>;
  };

  // Shell
  shell: {
    openExternal: (url: string) => Promise<void>;
    openPath: (path: string) => Promise<void>;
    openInEditor: (path: string) => Promise<{ editor: string }>;
    openInTerminal: (command: string) => Promise<{ success: boolean; message?: string }>;
  };

  // Dev Server (for preview)
  devServer: {
    start: (projectPath: string) => Promise<string>;
    stop: () => Promise<{ success: boolean }>;
    openBrowser: (url: string) => Promise<void>;
    onOutput: (callback: (data: { sessionId: string; content: string }) => void) => void;
    onExit: (callback: (data: { sessionId: string; code: number }) => void) => void;
    removeListeners: () => void;
  };

  // Setup (for running install/auth commands)
  setup: {
    runCommand: (command: string, sessionId: string) => Promise<void>;
    sendInput: (sessionId: string, input: string) => Promise<void>;
    killSession: (sessionId: string) => Promise<void>;
    openInTerminal: (command: string) => Promise<void>;
    onOutput: (callback: (data: { sessionId: string; content: string }) => void) => void;
    onExit: (callback: (data: { sessionId: string; code: number }) => void) => void;
    removeListeners: () => void;
  };
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

export {};
