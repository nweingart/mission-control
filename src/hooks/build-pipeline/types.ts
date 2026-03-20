import type { Task, TaskPhase, ReviewArtifact, TaskPipelineStatus, TokenCount, BuildMetrics } from '../../types';
import type { ClassifiedError } from '../../utils/pipeline-errors';

// ─── Phase ordering for checkpoint logic ──────────────────────
export const PHASE_ORDER: Record<string, number> = {
  branched: 1,
  built: 2,
  reviewed: 3,
  merged: 4,
};

export function completedPhaseLevel(task: Task): number {
  return task.buildPhase ? (PHASE_ORDER[task.buildPhase] ?? 0) : 0;
}

export interface BuildPipelineState {
  taskPhase: TaskPhase;
  currentBranch: string;
  reviewArtifact: ReviewArtifact | null;
  reviewHistory: ReviewArtifact[];
  reviewOutput: string;
  paused: boolean;
  sessionActive: boolean;
  currentTaskId: string | null;
  error: ClassifiedError | null;
  activeTasksMap: Map<string, TaskPipelineStatus>;
}

export interface BuildPipelineActions {
  togglePause: () => void;
  handleRetry: () => void;
  handleEndBuild: () => Promise<void>;
  handleNavigateBack: () => Promise<void>;
  resolveDecision: (taskId: string, response: string) => void;
}
