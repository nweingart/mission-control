/**
 * Assistant notifications are now event-driven, not generated on project load.
 * They fire only when:
 *   1. A build task completes successfully
 *   2. A build pipeline error occurs
 *
 * These are triggered directly from the store/hooks via set({ assistantGreeting: ... }).
 * This file provides helper message generators.
 */

export function buildTaskCompleteMessage(taskTitle: string, completedCount: number, totalCount: number): string {
  if (completedCount === totalCount) {
    return `All ${totalCount} tasks complete. Ready for preview.`;
  }
  return `"${taskTitle}" completed. ${totalCount - completedCount} ${totalCount - completedCount === 1 ? 'task' : 'tasks'} remaining.`;
}

export function buildErrorMessage(taskTitle: string, errorHint?: string): string {
  if (errorHint) {
    return `Hit a snag on "${taskTitle}". ${errorHint}`;
  }
  return `"${taskTitle}" ran into trouble. Check the build log.`;
}

export function buildErrorDiagnostic(taskTitle: string, errorHint: string, errorOutput?: string): string {
  let msg = `I hit a problem building "${taskTitle}". ${errorHint} You can Retry the task, Skip it, or ask me what went wrong.`;
  if (errorOutput) {
    msg += `\n\n**Build output:**\n\`\`\`\n${errorOutput}\n\`\`\``;
  }
  return msg;
}
