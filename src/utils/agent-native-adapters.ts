import type { Task, TaskPhase, TaskPipelineStatus, BuildMetrics, GitEvent } from '../types';
import type { TaskNode, StepStatus, CostEntry, AgentStep } from 'agent-native';

const PHASE_LABELS: Partial<Record<TaskPhase, string>> = {
  branching: 'Creating branch...',
  building: 'Building...',
  awaiting_decision: 'Decision needed',
  committing: 'Committing...',
  reviewing: 'Reviewing...',
  fixing: 'Auto-fixing...',
  merging: 'Merging...',
  pushing: 'Pushing...',
};

/**
 * Maps a single Task to an agent-native StepStatus.
 */
function taskToStatus(
  task: Task,
  activeTasksMap: Map<string, TaskPipelineStatus>,
  currentTaskId: string | null,
): StepStatus {
  if (task.completed) return 'complete';
  const pipelineStatus = activeTasksMap.get(task.id);
  if (pipelineStatus?.phase === 'awaiting_decision') return 'waiting_approval';
  if (pipelineStatus || task.id === currentTaskId) return 'running';
  if (task.buildPhase && task.buildPhase !== 'merged') return 'waiting_approval';
  return 'pending';
}

/**
 * Maps Task[] → agent-native TaskNode[], grouped by tier.
 */
export function tasksToTaskNodes(
  tasks: Task[],
  activeTasksMap: Map<string, TaskPipelineStatus>,
  currentTaskId: string | null,
  _globalPhase: TaskPhase,
): TaskNode[] {
  // Group tasks by tier
  const tierMap = new Map<number, Task[]>();
  const rootTasks: Task[] = [];

  for (const task of tasks) {
    if (task.tier != null) {
      const group = tierMap.get(task.tier);
      if (group) {
        group.push(task);
      } else {
        tierMap.set(task.tier, [task]);
      }
    } else {
      rootTasks.push(task);
    }
  }

  const result: TaskNode[] = [];

  // Tier groups as parent nodes
  const sortedTiers = [...tierMap.keys()].sort((a, b) => a - b);
  for (const tier of sortedTiers) {
    const tierTasks = tierMap.get(tier)!;
    const children: TaskNode[] = tierTasks.map((task) => {
      const status = taskToStatus(task, activeTasksMap, currentTaskId);
      const pipelineStatus = activeTasksMap.get(task.id);
      const phase = pipelineStatus?.phase ?? (task.id === currentTaskId ? _globalPhase : undefined);
      const description = status === 'running' && phase ? PHASE_LABELS[phase] : undefined;

      return {
        id: task.id,
        label: task.title,
        status,
        description,
      };
    });

    // Determine tier status from children
    const allComplete = children.every((c) => c.status === 'complete');
    const anyRunning = children.some((c) => c.status === 'running');
    const tierStatus: StepStatus = allComplete ? 'complete' : anyRunning ? 'running' : 'pending';

    result.push({
      id: `tier-${tier}`,
      label: `Tier ${tier}`,
      status: tierStatus,
      children,
    });
  }

  // Tierless tasks at root level
  for (const task of rootTasks) {
    const status = taskToStatus(task, activeTasksMap, currentTaskId);
    const pipelineStatus = activeTasksMap.get(task.id);
    const phase = pipelineStatus?.phase ?? (task.id === currentTaskId ? _globalPhase : undefined);
    const description = status === 'running' && phase ? PHASE_LABELS[phase] : undefined;

    result.push({
      id: task.id,
      label: task.title,
      status,
      description,
    });
  }

  return result;
}

// ─── Git History Adapters ────────────────────────────────────────

function getEventDisplayData(event: GitEvent): { description: string; colorKey: string } {
  switch (event.type) {
    case 'branch_created':
      return { description: `Branch created: ${event.branchName || 'unknown'}`, colorKey: 'accent' };
    case 'committed':
      return { description: `Committed: "${event.commitMessage || ''}"`, colorKey: 'ink-secondary' };
    case 'review_completed': {
      const findingCount = event.reviewArtifact?.findings.length || 0;
      const hasCritical = event.reviewArtifact?.findings.some(f => f.severity === 'critical');
      return {
        description: `Review: ${findingCount} finding${findingCount !== 1 ? 's' : ''}`,
        colorKey: hasCritical ? 'error' : 'success',
      };
    }
    case 'auto_fixed':
      return { description: `Auto-fixed: "${event.commitMessage || ''}"`, colorKey: 'success' };
    case 'merged':
      return { description: 'Merged to main', colorKey: 'success' };
    case 'pushed':
      return { description: 'Pushed to remote', colorKey: 'success' };
    case 'gap_analysis_complete':
      return { description: event.commitMessage || 'Gap analysis complete', colorKey: 'success' };
    case 'deployed':
      return { description: event.commitMessage || 'Deployed', colorKey: 'success' };
    default:
      return { description: event.type, colorKey: 'ink-muted' };
  }
}

/**
 * Maps GitEvent[] → AgentStep[] for use with AgentTimeline.
 */
export function gitEventsToAgentSteps(events: GitEvent[]): AgentStep[] {
  return events.map((event) => {
    const { description, colorKey } = getEventDisplayData(event);
    const isClickable = (event.type === 'committed' || event.type === 'auto_fixed') && !!event.commitHash;

    return {
      id: event.id,
      label: description,
      status: 'complete' as const,
      completedAt: new Date(event.timestamp).getTime(),
      metadata: {
        eventType: event.type,
        colorKey,
        commitHash: event.commitHash,
        branchName: event.branchName,
        reviewArtifact: event.reviewArtifact,
        isClickable,
        timestamp: event.timestamp,
      },
    };
  });
}

/**
 * Maps BuildMetrics → agent-native CostEntry[].
 */
export function buildMetricsToCostEntries(metrics: BuildMetrics): CostEntry[] {
  return metrics.taskMetrics.map((tm) => ({
    id: tm.taskId,
    model: tm.tokens.buildAgent ?? 'claude',
    cost: tm.tokens.total.input + tm.tokens.total.output,
    inputTokens: tm.tokens.total.input,
    outputTokens: tm.tokens.total.output,
    timestamp: Date.now(),
    label: tm.taskTitle,
  }));
}
