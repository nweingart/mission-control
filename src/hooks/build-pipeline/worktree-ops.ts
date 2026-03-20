import type { Task, TokenCount, TaskTokenUsage, ChatResult, DecisionRequest, ResolvedDecision } from '../../types';
import type { AgentAPI } from '../../utils/agent-router';
import { slugify, parseReviewResponse, hasFixableIssues, buildReviewPrompt, buildFixPrompt } from '../../utils/build-helpers';
import { retryWithBackoff, retryOnTimeout } from './retry-utils';
import { extractTokens } from './token-tracking';
import { buildWithDecisionLoop, createDecisionGate, effectiveDepth } from './decision-loop';

export interface WorktreeDeps {
  projectPath: string;
  currentProject: { slug: string; name: string; idea?: string };
  tasks: Task[];
  isMountedRef: { current: boolean };
  runIdRef: { current: number };
  updateTask: (id: string, updates: Partial<Task>) => void;
  addGitEvent: (event: Omit<import('../../types').GitEvent, 'id' | 'timestamp'>) => void;
  updateActiveTask: (taskId: string, updates: Partial<import('../../types').TaskPipelineStatus>) => void;
  removeActiveTask: (taskId: string) => void;
  notifyAssistantBuildComplete: (title: string) => void;
  builderAgent: AgentAPI;
  reviewerAgent: AgentAPI;
  taskOutputBuffersRef: { current: Map<string, string> };
  buildChatIdsRef: { current: Set<string> };
  taskStartTimesRef: { current: Map<string, number> };
  accumulateTokens: (result: ChatResult) => void;
  /** Map of taskId → resolve function for pending decisions (populated by decision loop) */
  decisionResolversRef: { current: Map<string, (response: string) => void> };
  /** Sync buildChatIdsRef to store for external cancellation */
  syncBuildChatIds: () => void;
}

export async function cleanupStaleWorktrees(
  projectSlug: string,
  projectPath: string,
): Promise<void> {
  const worktreeDir = `/tmp/mc-worktrees/${projectSlug}`;
  try {
    const entries = await window.api.fs.readdir(worktreeDir);
    for (const entry of entries) {
      try { await window.api.github.removeWorktree(projectPath, `${worktreeDir}/${entry}`); } catch { /* best effort */ }
    }
  } catch { /* dir doesn't exist — that's fine */ }

  // Clean up stale feature branches left by previous crashed builds.
  try {
    const branchOutput = await window.api.github.runShellCommand(projectPath, 'git', ['branch', '--list', 'feature/task-*']);
    const staleBranches = branchOutput.split('\n').map(b => b.trim().replace(/^\*\s*/, '')).filter(Boolean);
    for (const branch of staleBranches) {
      try { await window.api.github.deleteBranch(projectPath, branch); } catch { /* best effort */ }
    }
  } catch { /* best effort */ }
}

export async function cleanupFailedWorktree(
  projectPath: string,
  worktreePath: string,
  branchName: string,
): Promise<void> {
  try { await window.api.github.removeWorktree(projectPath, worktreePath); } catch { /* best effort */ }
  try { await window.api.github.deleteBranch(projectPath, branchName); } catch { /* best effort */ }
}

export async function buildTaskInWorktree(
  task: Task,
  idx: number,
  myRunId: number,
  deps: WorktreeDeps,
): Promise<{ branchName: string; worktreePath: string }> {
  const {
    projectPath, currentProject, tasks, isMountedRef, runIdRef,
    updateTask, addGitEvent, updateActiveTask,
    builderAgent, reviewerAgent,
    taskOutputBuffersRef, buildChatIdsRef, taskStartTimesRef,
    accumulateTokens, syncBuildChatIds,
  } = deps;

  taskStartTimesRef.current.set(task.id, Date.now());
  const isStale = () => myRunId !== runIdRef.current;
  const branchName = task.branchName || `feature/task-${idx + 1}-${slugify(task.title)}`;
  const worktreePath = `/tmp/mc-worktrees/${currentProject.slug}/task-${task.id}`;
  const chatId = `build-${task.id}-${Date.now()}`;

  updateActiveTask(task.id, { phase: 'branching', branchName, worktreePath, chatId });

  // Create worktree from main
  await window.api.github.createWorktree(projectPath, worktreePath, branchName, 'main');
  updateTask(task.id, { buildPhase: 'branched', branchName });
  addGitEvent({ type: 'branch_created', taskId: task.id, taskTitle: task.title, branchName });

  // Install dependencies in the worktree
  try {
    await window.api.github.runShellCommand(worktreePath, 'npm', ['install']);
  } catch {
    // Non-fatal
  }

  if (!isMountedRef.current || isStale()) throw new Error('Pipeline cancelled');

  // BUILDING
  updateActiveTask(task.id, { phase: 'building' });
  const prd = await window.api.storage.getPRD(currentProject.slug);
  const context = prd || currentProject.idea || '';
  const buildPrompt = `I'm building "${currentProject.name}".\n\n## Context\n${context}\n\n## Your Task\nTask ${idx + 1} of ${tasks.length}: ${task.title}${task.description ? `\nDetails: ${task.description}` : ''}\n\nBuild this task completely. Do not work on anything else.`;

  // Register per-task output handler
  const appendOutput = (content: string) => {
    const buf = taskOutputBuffersRef.current;
    buf.set(task.id, (buf.get(task.id) || '') + content);
  };
  builderAgent.onChatOutputForTask(chatId, appendOutput);
  buildChatIdsRef.current.add(chatId);
  syncBuildChatIds();

  // Register stream event handler for tool call tracking
  const toolCalls: import('../../types').BuildToolCall[] = [];
  window.api.claude.onStreamEventForTask(chatId, (event: unknown) => {
    const e = event as { type?: string; toolName?: string; toolInput?: Record<string, unknown> };
    if (e.type === 'tool_use' && e.toolName) {
      const tc: import('../../types').BuildToolCall = {
        id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: e.toolName,
        input: e.toolInput || {},
        status: 'running',
        startedAt: Date.now(),
      };
      toolCalls.push(tc);
      // Keep only last 20 to avoid unbounded growth
      if (toolCalls.length > 20) toolCalls.shift();
      updateActiveTask(task.id, { toolCalls: [...toolCalls] });
    }
  });

  // Token tracking for this task
  let buildTokens: TokenCount | undefined;
  let reviewTokens: TokenCount | undefined;
  let fixTokens: TokenCount | undefined;

  const depth = effectiveDepth(builderAgent, task);

  try {
    if (depth === 'small') {
      // Standard single-shot build
      const buildResult = await retryOnTimeout(() => builderAgent.chat(worktreePath, buildPrompt, 10 * 60 * 1000, chatId), 2, `build:${task.title}`);
      buildTokens = extractTokens(buildResult);
      accumulateTokens(buildResult);
    } else {
      // Decision-aware build loop for medium/large tasks
      const gate = createDecisionGate();
      deps.decisionResolversRef.current.set(task.id, gate.resolveDecision);

      try {
        await buildWithDecisionLoop(
          builderAgent,
          worktreePath,
          buildPrompt,
          task,
          depth,
          chatId,
          10 * 60 * 1000,
          {
            onDecisionDetected: (decision: DecisionRequest) => {
              updateActiveTask(task.id, {
                phase: 'awaiting_decision',
                pendingDecision: decision,
              });
              updateTask(task.id, { pendingDecision: decision });
            },
            onDecisionResolved: (resolved: ResolvedDecision) => {
              const history = [
                ...(deps.tasks.find(t => t.id === task.id)?.decisionHistory ?? []),
                resolved,
              ];
              updateActiveTask(task.id, {
                phase: 'building',
                pendingDecision: null,
              });
              updateTask(task.id, {
                pendingDecision: null,
                decisionHistory: history,
              });
            },
            waitForDecisionResponse: gate.waitForDecisionResponse,
          },
        );
      } finally {
        deps.decisionResolversRef.current.delete(task.id);
      }
    }
  } finally {
    builderAgent.offChatOutputForTask(chatId);
    window.api.claude.offStreamEventForTask(chatId);
  }

  if (!isMountedRef.current || isStale()) throw new Error('Pipeline cancelled');

  // COMMITTING
  updateActiveTask(task.id, { phase: 'committing' });
  const commitResult = await retryWithBackoff(() => window.api.github.gitAddAndCommit(worktreePath, `feat: ${task.title}`));
  addGitEvent({ type: 'committed', taskId: task.id, taskTitle: task.title, branchName, commitHash: commitResult.commitHash, commitMessage: `feat: ${task.title}` });
  updateTask(task.id, { buildPhase: 'built' });

  if (!isMountedRef.current || isStale()) throw new Error('Pipeline cancelled');

  // REVIEWING
  updateActiveTask(task.id, { phase: 'reviewing' });
  const diff = await window.api.github.getDiff(worktreePath, 'main');

  if (diff.trim().length > 0) {
    let diffStat = '';
    try { diffStat = await window.api.github.getDiffStat(worktreePath, 'main'); } catch { diffStat = 'unable to compute'; }

    const reviewChatId = `review-${task.id}-${Date.now()}`;
    reviewerAgent.onChatOutputForTask(reviewChatId, appendOutput);
    buildChatIdsRef.current.add(reviewChatId);
    syncBuildChatIds();
    try {
      const reviewResult = await retryOnTimeout(
        () => reviewerAgent.chat(worktreePath, buildReviewPrompt(task, diff), 10 * 60 * 1000, reviewChatId), 1, `review:${task.title}`
      );
      reviewTokens = extractTokens(reviewResult);
      accumulateTokens(reviewResult);
      const artifact = parseReviewResponse(reviewResult.response, task, branchName, diffStat);
      addGitEvent({ type: 'review_completed', taskId: task.id, taskTitle: task.title, branchName, reviewArtifact: artifact });

      if (!isMountedRef.current || isStale()) throw new Error('Pipeline cancelled');

      // FIXING
      if (hasFixableIssues(artifact)) {
        updateActiveTask(task.id, { phase: 'fixing' });
        const fixChatId = `fix-${task.id}-${Date.now()}`;
        reviewerAgent.onChatOutputForTask(fixChatId, appendOutput);
        buildChatIdsRef.current.add(fixChatId);
        syncBuildChatIds();
        try {
          const fixResult = await retryOnTimeout(
            () => reviewerAgent.chat(worktreePath, buildFixPrompt(artifact), 10 * 60 * 1000, fixChatId), 1, `fix:${task.title}`
          );
          fixTokens = extractTokens(fixResult);
          accumulateTokens(fixResult);
        } finally {
          reviewerAgent.offChatOutputForTask(fixChatId);
        }
        artifact.findings = artifact.findings.map(f => {
          if (f.severity === 'warning') return { ...f, fixed: true };
          if (f.severity === 'critical' && artifact.canAutoFix) return { ...f, fixed: true };
          return f;
        });
        artifact.autoFixApplied = true;
        await window.api.github.gitAddAndCommit(worktreePath, `fix: review findings for ${task.title}`);
        addGitEvent({ type: 'auto_fixed', taskId: task.id, taskTitle: task.title, branchName, commitHash: '', commitMessage: `fix: review findings for ${task.title}` });
      }

      updateTask(task.id, { buildPhase: 'reviewed', lastReviewArtifact: artifact });
    } finally {
      reviewerAgent.offChatOutputForTask(reviewChatId);
    }
  } else {
    updateTask(task.id, { buildPhase: 'reviewed' });
  }

  // Save per-task token usage
  const totalInput = (buildTokens?.input ?? 0) + (reviewTokens?.input ?? 0) + (fixTokens?.input ?? 0);
  const totalOutput = (buildTokens?.output ?? 0) + (reviewTokens?.output ?? 0) + (fixTokens?.output ?? 0);
  if (totalInput > 0 || totalOutput > 0) {
    const tokenUsage: TaskTokenUsage = {
      build: buildTokens,
      review: reviewTokens,
      fix: fixTokens,
      total: { input: totalInput, output: totalOutput },
      buildAgent: builderAgent.provider,
      reviewAgent: reviewerAgent.provider,
    };
    updateTask(task.id, { tokenUsage });
  }

  return { branchName, worktreePath };
}

export async function mergeTaskFromWorktree(
  task: Task,
  branchName: string,
  worktreePath: string,
  deps: Pick<WorktreeDeps, 'projectPath' | 'addGitEvent' | 'updateTask' | 'notifyAssistantBuildComplete' | 'removeActiveTask'>,
): Promise<void> {
  const { projectPath, addGitEvent, updateTask, notifyAssistantBuildComplete, removeActiveTask } = deps;

  // Merge happens in main repo (projectPath), not the worktree
  await retryWithBackoff(() => window.api.github.checkoutBranch(projectPath, 'main'));
  await window.api.github.mergeBranch(projectPath, branchName);
  addGitEvent({ type: 'merged', taskId: task.id, taskTitle: task.title, branchName });

  // Cleanup worktree + branch
  try { await window.api.github.removeWorktree(projectPath, worktreePath); } catch { /* best effort */ }
  try { await window.api.github.deleteBranch(projectPath, branchName); } catch { /* best effort */ }

  // Push (non-fatal)
  try {
    const gitStatus = await window.api.github.checkGitStatus(projectPath);
    if (gitStatus.hasRemote) {
      await window.api.github.gitPush(projectPath);
      addGitEvent({ type: 'pushed', taskId: task.id, taskTitle: task.title });
    }
  } catch { /* push failure is non-fatal */ }

  updateTask(task.id, { buildPhase: 'merged', completed: true });
  notifyAssistantBuildComplete(task.title);
  removeActiveTask(task.id);
}
