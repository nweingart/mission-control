import type { TokenCount, TaskTokenUsage, BuildMetrics, ChatResult, Task } from '../../types';

// Helper: extract TokenCount from ChatResult usage
export function extractTokens(result: ChatResult): TokenCount | undefined {
  if (result.usage) {
    return { input: result.usage.input_tokens, output: result.usage.output_tokens };
  }
  return undefined;
}

// Helper: accumulate running totals — returns deltas to apply
export function accumulateTokenDeltas(result: ChatResult): { tokensDelta: TokenCount | null; costDelta: number } {
  const tokensDelta = result.usage
    ? { input: result.usage.input_tokens, output: result.usage.output_tokens }
    : null;
  const costDelta = result.costUsd ?? 0;
  return { tokensDelta, costDelta };
}

// Compute final aggregate build metrics after all tasks complete
export function computeFinalBuildMetrics(
  freshTasks: Task[],
  buildTokens: TokenCount,
  buildCostUsd: number,
  buildStartTime: number,
  taskStartTimes: Map<string, number>,
  tiersExecuted: number,
  allFailedIds: string[],
  retriedCount: number,
): BuildMetrics {
  const completedCount = freshTasks.filter(t => t.completed).length;
  return {
    totalTokens: { ...buildTokens },
    totalCostUsd: buildCostUsd,
    taskMetrics: freshTasks
      .filter(t => t.tokenUsage)
      .map(t => ({
        taskId: t.id,
        taskTitle: t.title,
        tokens: t.tokenUsage!,
        wallClockMs: taskStartTimes.has(t.id)
          ? Date.now() - taskStartTimes.get(t.id)!
          : 0,
        tier: t.tier ?? 0,
      })),
    wallClockMs: Date.now() - buildStartTime,
    tiersExecuted,
    tasksCompleted: completedCount,
    tasksFailed: allFailedIds.length,
    tasksRetried: retriedCount,
  };
}
