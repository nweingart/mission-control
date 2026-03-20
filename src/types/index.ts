// ── V2: Scan & Codebase Analysis Types ─────────────────────

export interface TechStack {
  languages: string[];
  frameworks: string[];
  buildTools: string[];
  summary: string;
}

export interface FeatureModule {
  id: string;
  fingerprint: string;
  name: string;
  description: string;
  prd: string;
  prdEditedByUser?: boolean;
  /** When re-scan generates a new PRD but user's edit is preserved, store the proposal here */
  proposedPrd?: string;
  files: string[];
  status: 'documented' | 'outdated';
  createdAt: string;
  lastUpdated: string;
}

export interface CodeIssue {
  id: string;
  fingerprint: string;
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'bug' | 'security' | 'performance' | 'dead_code';
  estimatedEffort: 'quick_fix' | 'moderate' | 'significant';
  file?: string;
  status: 'open' | 'planned' | 'fixed';
  backlogItemId?: string;
  planningChatId?: string;
  firstSeen: string;
  lastSeen: string;
}

export interface ScanSnapshot {
  id: string;
  timestamp: string;
  masterPrd: string;
  features: FeatureModule[];
  issues: CodeIssue[];
  techStack: TechStack;
  fileCount: number;
  summary: string;
}

export interface ScanDiff {
  newFeatures: string[];
  removedFeatures: string[];
  updatedFeatures: string[];
  issuesFixed: string[];
  newIssues: string[];
  summary: string;
}

export type ScanStatus = 'pending' | 'scanning' | 'issues_ready' | 'complete' | 'failed';

// ── Project ────────────────────────────────────────────────

export interface Project {
  slug: string;
  name: string;
  createdAt: string;
  projectPath: string;
  githubRepo: string;

  // V2: Scan state
  scanStatus: ScanStatus;
  lastScannedAt?: string;
  scanError?: string;
  lastScanDiff?: ScanDiff;
  techStack?: TechStack;

  // Carried forward
  envVars?: Record<string, string>;
  hasBuiltOnce?: boolean;

  // V1 legacy (kept for archived screens, will be removed)
  /** @deprecated V1 inception field */
  status?: ProjectStatus;
  /** @deprecated V1 inception field */
  idea?: string;
  /** @deprecated V1 inception field */
  prd?: string;
  /** @deprecated V1 inception field */
  humanTasks?: HumanTask[];
  /** @deprecated V1 inception field */
  designPreferences?: DesignPreferences;
}

// ── V1 Legacy Types (kept for archived screens) ───────────

export type ProjectStatus =
  | 'idea'
  | 'discovery'
  | 'prd_review'
  | 'planning'
  | 'building'
  | 'previewing'
  | 'deploying'
  | 'complete';

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

export type InteractionDepth = 'small' | 'medium' | 'large';

export interface DecisionRequest {
  id: string;
  question: string;
  context: string;
  options?: string[];
  timestamp: number;
}

export interface ResolvedDecision extends DecisionRequest {
  response: string;
  resolvedBy: 'user' | 'auto';
  resolvedAt: number;
}

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

  // Token tracking (Phase 4)
  tokenUsage?: TaskTokenUsage;

  // Interaction depth (controls human-in-the-loop behavior)
  interactionDepth?: InteractionDepth;
  pendingDecision?: DecisionRequest | null;
  decisionHistory?: ResolvedDecision[];
}

export interface TokenCount {
  input: number;
  output: number;
}

export type AgentProvider = 'claude' | 'codex';

export interface AgentRoleConfig {
  builder: AgentProvider;
  reviewer: AgentProvider;
}

export interface TaskTokenUsage {
  build?: TokenCount;
  review?: TokenCount;
  fix?: TokenCount;
  total: TokenCount;
  buildAgent?: AgentProvider;
  reviewAgent?: AgentProvider;
}

export interface BuildMetrics {
  totalTokens: TokenCount;
  totalCostUsd: number;
  taskMetrics: {
    taskId: string;
    taskTitle: string;
    tokens: TaskTokenUsage;
    wallClockMs: number;
    tier: number;
  }[];
  wallClockMs: number;
  tiersExecuted: number;
  tasksCompleted: number;
  tasksFailed: number;
  tasksRetried: number;
}

export interface ChatResult {
  response: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  model?: string;
  costUsd?: number;
  durationMs?: number;
  numTurns?: number;
  agent?: AgentProvider;
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
  codex?: { installed: boolean; authenticated: boolean };
}

export type Screen =
  | 'onboarding'
  | 'home'
  | 'import'
  | 'scanning'
  | 'project-home'
  | 'docs'
  | 'issues'
  | 'planning'
  | 'building'
  | 'planning-chats'
  | 'git-history'
  | 'settings'
  // V1 legacy (kept for archived screens)
  | 'idea'
  | 'discovery'
  | 'prd-review'
  | 'previewing'
  | 'deploying'
  | 'complete'
  | 'deployments'
  | 'gap-analysis';

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
  multiAgentEnabled?: boolean;
  agentRoles?: AgentRoleConfig;
  pauseBetweenTiers?: boolean;
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
  | 'awaiting_decision'
  | 'committing'
  | 'reviewing'
  | 'fixing'
  | 'merging'
  | 'pushing'
  | 'complete'
  | 'error';

export interface BuildToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: 'pending' | 'running' | 'complete' | 'error';
  startedAt?: number;
}

export interface TaskPipelineStatus {
  taskId: string;
  phase: TaskPhase;
  branchName: string;
  worktreePath: string;
  chatId: string;
  output: string;
  toolCalls?: BuildToolCall[];
  pendingDecision?: DecisionRequest | null;
  decisionHistory?: ResolvedDecision[];
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
  estimatedEffort?: 'quick_fix' | 'moderate' | 'significant';
  sprintId?: string;
  notes?: string;
  interactionDepth?: InteractionDepth;
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

export type UserRank = 'Beginner' | 'Contributor' | 'Builder' | 'Lead' | 'Expert';

/** @deprecated Use UserRank instead */
export type MissionRank = UserRank;

export interface GamificationStats {
  streakCount: number;
  lastActivityDate: string | null;
  streakFreezeUsedThisWeek: boolean;
  lastFreezeWeek: string | null;
  totalTasksCompleted: number;
  totalBuilds: number;
  milestones: string[];
}

export interface PlanningChat {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}
