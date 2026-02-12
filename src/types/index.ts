export interface Project {
  slug: string;
  name: string;
  status: ProjectStatus;
  createdAt: string;
  projectPath: string;
  vercelUrl?: string;
  supabaseRef?: string;
  supabaseSchema?: string;
  githubRepo?: string;
  idea?: string;
  prd?: string;
  envVars?: Record<string, string>;
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
  completed: boolean;
  buildPhase?: 'branched' | 'built' | 'reviewed' | 'merged';
  branchName?: string;
  lastReviewArtifact?: ReviewArtifact;
}

export interface CLIStatus {
  claude: { installed: boolean; authenticated: boolean };
  github: { installed: boolean; authenticated: boolean };
  vercel: { installed: boolean; authenticated: boolean };
  supabase: { installed: boolean; authenticated: boolean };
}

export type Screen =
  | 'onboarding'
  | 'setup-workspace'
  | 'setup-deploy'
  | 'setup-ready'
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

export interface AppState {
  screen: Screen;
  currentProject: Project | null;
  projects: Project[];
  cliStatus: CLIStatus | null;
  isLoading: boolean;
  error: string | null;
}

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

export type PlanningType = 'bug_fix' | 'feature_refactor' | 'new_feature';

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
  status?: 'todo' | 'in_progress' | 'done';
  sprintId?: string;
  notes?: string;
}

export interface Sprint {
  id: string;
  name: string;
  order: number;
  createdAt: string;
  archived?: boolean;
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
  vercelUrl?: string;
  vercelProjectId?: string;
  status: 'pushing' | 'deploying' | 'watching' | 'success' | 'failed';
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

export interface PlanningChat {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}
