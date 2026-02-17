export interface DesignPreferences {
  colorTemp: 'warm' | 'cool';
  saturation: 'vibrant' | 'muted';
  typography: 'modern' | 'classic';
  spacing: 'spacious' | 'compact';
  corners: 'rounded' | 'sharp';
  depth: 'flat' | 'elevated';
  contrast: 'soft' | 'bold';
  style: 'minimal' | 'rich';
  theme: 'light' | 'dark';
  vibe: 'professional' | 'playful';
}

export interface HumanTask {
  id: string;
  title: string;
  description: string;
  service?: string;
  status: 'pending' | 'completed';
  completedAt?: string;
  blocksPreview: boolean;
  links?: { label: string; url: string }[];
  verification?: {
    type: 'env_var_check';
    envVars: string[];
  };
}

export interface Project {
  slug: string;
  name: string;
  status: ProjectStatus;
  createdAt: string;
  projectPath: string;
  githubRepo?: string;
  idea?: string;
  prd?: string;
  envVars?: Record<string, string>;
  hasBuiltOnce?: boolean;
  humanTasks?: HumanTask[];
  designPreferences?: DesignPreferences;
}

export type ProjectStatus =
  | 'idea'
  | 'discovery'
  | 'prd_review'
  | 'planning'
  | 'building'
  | 'previewing'
  | 'deploying'
  | 'complete';

export interface Task {
  id: string;
  title: string;
  description?: string;
  estimatedMinutes?: number;
  completed: boolean;
  buildPhase?: 'branched' | 'built' | 'reviewed' | 'merged';
  branchName?: string;
  lastReviewArtifact?: ReviewArtifact;

  // File manifest (predicted by Claude during task generation)
  creates?: string[];
  modifies?: string[];

  // Dependency graph (computed deterministically from file manifests)
  dependsOn?: string[];
  tier?: number;
}

export interface TierGroup {
  tier: number;
  taskIds: string[];
  estimatedMin: number;
}

export interface TierPlan {
  tiers: TierGroup[];
  criticalPathLength: number;
  estimatedSequentialMin: number;
  estimatedParallelMin: number;
}

export interface CLIStatus {
  claude: { installed: boolean; authenticated: boolean };
  github: { installed: boolean; authenticated: boolean };
}

export type Screen =
  | 'onboarding'
  | 'home'
  | 'project-home'
  | 'idea'
  | 'discovery'
  | 'prd-review'
  | 'planning'
  | 'building'
  | 'previewing'
  | 'deploying'
  | 'complete'
  | 'planning-chats'
  | 'git-history'
  | 'deployments'
  | 'gap-analysis'
  | 'settings';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface Config {
  developmentPath: string;
  theme?: 'light' | 'dark';
  hasCompletedOnboarding?: boolean;
  hasSetWorkspace?: boolean;
  freeProjectUsed?: boolean;
  devMode?: boolean;
}

export interface ReviewFinding {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  description: string;
  file?: string;
  fixed: boolean;
}

export interface ReviewArtifact {
  taskId: string;
  taskTitle: string;
  branchName: string;
  findings: ReviewFinding[];
  summary: string;
  autoFixApplied: boolean;
  canAutoFix: boolean;
  diffStat: string;
  timestamp: string;
}

export type TaskPhase =
  | 'idle'
  | 'branching'
  | 'building'
  | 'committing'
  | 'reviewing'
  | 'fixing'
  | 'merging'
  | 'pushing'
  | 'complete'
  | 'error';

export interface TaskPipelineStatus {
  taskId: string;
  phase: TaskPhase;
  branchName: string;
  worktreePath: string;
  chatId: string;
}

export type PlanningType = 'bug_fix' | 'feature_refactor' | 'new_feature';

export type SprintStatus = 'planning' | 'active' | 'completed';

export interface BacklogItem {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  type?: PlanningType;
  createdAt: string;
  chatId?: string; // links to originating planning chat
  prd?: string;
  prdStatus?: 'pending' | 'generating' | 'complete' | 'failed';
  estimatedTasks?: number;
  storyPoints?: number;
  sprintId?: string;
  notes?: string;
}

export interface Sprint {
  id: string;
  name: string;
  order: number;
  createdAt: string;
  status: SprintStatus;
  deadline?: string;
}

export interface GitEvent {
  id: string;
  type: 'branch_created' | 'committed' | 'review_completed' | 'auto_fixed' | 'merged' | 'pushed' | 'deployed' | 'gap_analysis_complete';
  taskId?: string;
  taskTitle?: string;
  branchName?: string;
  commitHash?: string;
  commitMessage?: string;
  reviewArtifact?: ReviewArtifact;
  timestamp: string;
}

export interface DeploymentRecord {
  id: string;
  branch: string;
  commitHash: string;
  commitMessage?: string;
  githubRepoUrl?: string;
  status: 'pushing' | 'success' | 'failed';
  workflowRunId?: number;
  error?: string;
  timestamp: string;
}

export interface GapFinding {
  category: string;
  description: string;
  prdSection?: string;
  severity: 'missing' | 'incomplete' | 'deviation';
  resolved: boolean;
}

export interface GapAnalysis {
  id: string;
  pass: 1 | 2;
  grade: number;
  validatedGrade: number;
  findings: GapFinding[];
  summary: string;
  fixesApplied: boolean;
  fixCommitHash?: string;
  remainingItems: string[];
  timestamp: string;
}

export type MissionRank = 'Cadet' | 'Flight Controller' | 'Mission Specialist' | 'Mission Commander' | 'Houston Actual';

export interface GamificationStats {
  streakCount: number;
  lastActivityDate: string | null;
  streakFreezeUsedThisWeek: boolean;
  lastFreezeWeek: string | null;
  totalTasksLanded: number;
  totalLaunches: number;
  milestones: string[];
}

export interface PlanningChat {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}
