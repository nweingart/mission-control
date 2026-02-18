import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useProjectStore, useProjectStoreApi } from '../store/ProjectStoreContext';
import { useIsMounted } from './useIsMounted';
import type { Task, TaskPhase, ReviewArtifact, TaskPipelineStatus, TokenCount, TaskTokenUsage, BuildMetrics, ChatResult, AgentRoleConfig } from '../types';
import { getAgentForRole, cancelBuildAgents } from '../utils/agent-router';
import type { AgentAPI } from '../utils/agent-router';
import {
  slugify,
  parseReviewResponse,
  hasFixableIssues,
  hasCriticalUnfixable,
  buildReviewPrompt,
  buildFixPrompt,
} from '../utils/build-helpers';
import { classifyError } from '../utils/pipeline-errors';
import type { ClassifiedError } from '../utils/pipeline-errors';
import { computeTierPlan } from '../utils/dag-scheduler';

// ─── Phase ordering for checkpoint logic ──────────────────────
const PHASE_ORDER: Record<string, number> = {
  branched: 1,
  built: 2,
  reviewed: 3,
  merged: 4,
};

function completedPhaseLevel(task: Task): number {
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
}

async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3, baseMs = 500): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === maxRetries) throw err;
      await new Promise(r => setTimeout(r, baseMs * Math.pow(2, i)));
    }
  }
  throw new Error('unreachable');
}

async function retryOnTimeout<T>(
  fn: () => Promise<T>, maxRetries = 2, label = ''
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await fn(); }
    catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      const isTimeout = msg.includes('no output for') || msg.includes('timed out');
      if (!isTimeout || attempt === maxRetries) throw err;
      console.log(`[BuildPipeline] Timeout on ${label}, retry ${attempt + 1}/${maxRetries}`);
      await new Promise(r => setTimeout(r, 5000 * (attempt + 1)));
    }
  }
  throw new Error('unreachable');
}

export function useBuildPipeline() {
  const {
    currentProject,
    tasks,
    updateTask,
    updateProject,
    goToPlanning,
    goToPreview,
    flowTestMode,
    addGitEvent,
    setBuildTaskPhase,
    setBuildCurrentTaskId,
    setBuildSessionActive,
    notifyHoustonBuildComplete,
    notifyHoustonBuildError,
  } = useProjectStore();
  const projectStoreApi = useProjectStoreApi();

  const isMountedRef = useIsMounted();

  // Multi-agent config — read once on mount, used at build start.
  // agentConfigLoaded gates runAllTasks to prevent racing with defaults.
  const [agentConfig, setAgentConfig] = useState<{
    multiAgentEnabled: boolean;
    agentRoles?: AgentRoleConfig;
  }>({ multiAgentEnabled: false });
  const [agentConfigLoaded, setAgentConfigLoaded] = useState(false);

  useEffect(() => {
    window.api.storage.getConfig().then((config) => {
      setAgentConfig({
        multiAgentEnabled: config.multiAgentEnabled ?? false,
        agentRoles: config.agentRoles,
      });
      setAgentConfigLoaded(true);
    });
  }, []);

  const builderAgent = useMemo(
    () => getAgentForRole(agentConfig.multiAgentEnabled, agentConfig.agentRoles, 'builder'),
    [agentConfig.multiAgentEnabled, agentConfig.agentRoles]
  );
  const reviewerAgent = useMemo(
    () => getAgentForRole(agentConfig.multiAgentEnabled, agentConfig.agentRoles, 'reviewer'),
    [agentConfig.multiAgentEnabled, agentConfig.agentRoles]
  );

  // Track all build-owned chatIds for scoped cancellation
  const buildChatIdsRef = useRef<Set<string>>(new Set());

  // Per-task pipeline state
  const [taskPhase, setTaskPhaseLocal] = useState<TaskPhase>('idle');
  const [currentBranch, setCurrentBranch] = useState('main');
  const [reviewArtifact, setReviewArtifact] = useState<ReviewArtifact | null>(null);
  const [reviewHistory, setReviewHistory] = useState<ReviewArtifact[]>([]);
  const [reviewOutput, setReviewOutput] = useState('');

  const [sessionActive, setSessionActiveLocal] = useState(false);
  const [currentTaskId, setCurrentTaskIdLocal] = useState<string | null>(null);
  const [error, setError] = useState<ClassifiedError | null>(null);

  // Mirror local state to store for cross-screen visibility
  const setTaskPhase = useCallback((phase: TaskPhase) => {
    setTaskPhaseLocal(phase);
    setBuildTaskPhase(phase);
  }, [setBuildTaskPhase]);

  const setCurrentTaskId = useCallback((id: string | null) => {
    setCurrentTaskIdLocal(id);
    setBuildCurrentTaskId(id);
  }, [setBuildCurrentTaskId]);

  const setSessionActive = useCallback((active: boolean) => {
    setSessionActiveLocal(active);
    setBuildSessionActive(active);
  }, [setBuildSessionActive]);
  const [preflightNeeded, setPreflightNeeded] = useState(false);
  const preflightResolveRef = useRef<(() => void) | null>(null);

  // Per-task Map for concurrent tracking (Phase 3)
  const [activeTasksMap, setActiveTasksMap] = useState<Map<string, TaskPipelineStatus>>(new Map());

  const updateActiveTask = useCallback((taskId: string, updates: Partial<TaskPipelineStatus>) => {
    setActiveTasksMap(prev => {
      const next = new Map(prev);
      const existing = next.get(taskId);
      next.set(taskId, { taskId, phase: 'idle', branchName: '', worktreePath: '', chatId: '', output: '', ...existing, ...updates });
      return next;
    });
  }, []);

  const removeActiveTask = useCallback((taskId: string) => {
    setActiveTasksMap(prev => {
      const next = new Map(prev);
      next.delete(taskId);
      return next;
    });
  }, []);

  // Per-task output buffering: accumulate in a ref and flush periodically to avoid
  // overwhelming React with state updates on every streaming chunk.
  const taskOutputBuffersRef = useRef<Map<string, string>>(new Map());
  const taskOutputFlushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start flushing output buffers to state at ~2Hz
  useEffect(() => {
    taskOutputFlushTimerRef.current = setInterval(() => {
      const buffers = taskOutputBuffersRef.current;
      if (buffers.size === 0) return;
      setActiveTasksMap(prev => {
        let changed = false;
        const next = new Map(prev);
        for (const [taskId, newOutput] of buffers) {
          const existing = next.get(taskId);
          if (existing) {
            // Keep only the last 4000 chars to avoid unbounded growth
            const combined = (existing.output + newOutput).slice(-4000);
            next.set(taskId, { ...existing, output: combined });
            changed = true;
          }
        }
        buffers.clear();
        return changed ? next : prev;
      });
    }, 500);
    return () => {
      if (taskOutputFlushTimerRef.current) clearInterval(taskOutputFlushTimerRef.current);
    };
  }, []);

  const pipelineStartedRef = useRef(false);
  const pipelineErrorRef = useRef(false);
  const taskPhaseRef = useRef<TaskPhase>('idle');
  const runIdRef = useRef(0);

  // Pause/resume mechanism
  const pauseRequestedRef = useRef(false);
  const pauseResolverRef = useRef<(() => void) | null>(null);
  const [paused, setPaused] = useState(false);

  // Auto-approve: when false (default), pipeline pauses after every tier for user review
  const autoApproveRef = useRef(false);

  // Stop-after-tier mechanism
  const stopAfterTierRef = useRef(false);
  const [stopRequested, setStopRequested] = useState(false);

  // Tier progress state
  const [currentTier, setCurrentTier] = useState(0);
  const [totalTiers, setTotalTiers] = useState(0);
  const [tierTasksComplete, setTierTasksComplete] = useState(0);
  const [tierTasksTotal, setTierTasksTotal] = useState(0);
  const [failedTaskIds, setFailedTaskIds] = useState<string[]>([]);

  // Token tracking state (Phase 4)
  const [buildTokens, setBuildTokens] = useState<TokenCount>({ input: 0, output: 0 });
  const [buildCostUsd, setBuildCostUsd] = useState(0);
  const [buildMetrics, setBuildMetrics] = useState<BuildMetrics | null>(null);
  const buildStartTimeRef = useRef(0);
  const taskStartTimesRef = useRef<Map<string, number>>(new Map());
  const retriedCountRef = useRef(0);

  // Helper: extract TokenCount from ChatResult usage
  const extractTokens = useCallback((result: ChatResult): TokenCount | undefined => {
    if (result.usage) {
      return { input: result.usage.input_tokens, output: result.usage.output_tokens };
    }
    return undefined;
  }, []);

  // Helper: accumulate running totals
  const accumulateTokens = useCallback((result: ChatResult) => {
    if (result.usage) {
      setBuildTokens(prev => ({
        input: prev.input + result.usage!.input_tokens,
        output: prev.output + result.usage!.output_tokens,
      }));
    }
    if (result.costUsd) {
      setBuildCostUsd(prev => prev + result.costUsd!);
    }
  }, []);

  // Keep refs in sync
  useEffect(() => {
    taskPhaseRef.current = taskPhase;
  }, [taskPhase]);

  // Sync activeTasksMap → single-value state for backward compat
  useEffect(() => {
    const entries = Array.from(activeTasksMap.values());
    if (entries.length > 0) {
      setCurrentTaskId(entries[0].taskId);
      setTaskPhase(entries[0].phase);
      setSessionActive(entries.some(e => e.phase === 'building'));
    }
  }, [activeTasksMap, setCurrentTaskId, setTaskPhase, setSessionActive]);

  const completedTasks = tasks.filter((t) => t.completed).length;
  const currentTask = tasks.find((t) => t.id === currentTaskId);
  const projectPath = currentProject?.projectPath || '';

  // Check if paused; if so, wait for resume
  const checkPause = useCallback((): Promise<void> => {
    if (!pauseRequestedRef.current) return Promise.resolve();
    setPaused(true);
    return new Promise((resolve) => {
      pauseResolverRef.current = resolve;
    });
  }, []);

  // Toggle pause/resume
  const togglePause = useCallback(() => {
    if (pauseRequestedRef.current) {
      // Resume
      pauseRequestedRef.current = false;
      setPaused(false);
      if (pauseResolverRef.current) {
        pauseResolverRef.current();
        pauseResolverRef.current = null;
      }
    } else {
      // Request pause — will take effect at next check point
      pauseRequestedRef.current = true;
    }
  }, []);

  // Ensure git repo exists with a 'main' branch before first task
  const ensureGitRepo = useCallback(async () => {
    const status = await window.api.github.checkGitStatus(projectPath);
    if (!status.hasGitRepo) {
      await window.api.github.gitInit(projectPath);
      await window.api.github.ensureGitignore(projectPath);
      try {
        const username = await window.api.github.getUsername();
        await window.api.github.ensureGitConfig(projectPath, username);
      } catch {
        await window.api.github.ensureGitConfig(projectPath, 'houston');
      }
      await window.api.github.gitAddAndCommit(projectPath, 'Initial commit');
    }

    // Ensure we're on a branch called 'main' (git init may default to 'master')
    const currentBranchName = await window.api.github.getCurrentBranch(projectPath);
    if (currentBranchName !== 'main') {
      try {
        await window.api.github.renameBranch(projectPath, 'main');
      } catch {
        // Rename failed for ANY reason — don't check message, just fall through
        try {
          await window.api.github.checkoutBranch(projectPath, 'main');
        } catch {
          // Checkout also failed — reset dirty state and retry
          await window.api.github.resetWorkingTree(projectPath);
          await window.api.github.checkoutBranch(projectPath, 'main');
        }
      }
    }
    // Don't resetWorkingTree here — we may be resuming with committed work on feature branches
  }, [projectPath]);

  // ─── WORKTREE-BASED PARALLEL PIPELINE (Phase 3) ───────────────
  const cleanupStaleWorktrees = useCallback(async () => {
    const projectSlug = currentProject!.slug;
    const worktreeDir = `/tmp/houston-worktrees/${projectSlug}`;
    try {
      const entries = await window.api.fs.readdir(worktreeDir);
      for (const entry of entries) {
        try { await window.api.github.removeWorktree(projectPath, `${worktreeDir}/${entry}`); } catch { /* best effort */ }
      }
    } catch { /* dir doesn't exist — that's fine */ }

    // Clean up stale feature branches left by previous crashed builds.
    // Without this, git worktree add -b <branch> fails if the branch already exists.
    try {
      const branchOutput = await window.api.github.runShellCommand(projectPath, 'git branch --list feature/task-*');
      const staleBranches = branchOutput.split('\n').map(b => b.trim().replace(/^\*\s*/, '')).filter(Boolean);
      for (const branch of staleBranches) {
        try { await window.api.github.deleteBranch(projectPath, branch); } catch { /* best effort */ }
      }
    } catch { /* best effort */ }
  }, [currentProject, projectPath]);

  const cleanupFailedWorktree = useCallback(async (worktreePath: string, branchName: string) => {
    try { await window.api.github.removeWorktree(projectPath, worktreePath); } catch { /* best effort */ }
    try { await window.api.github.deleteBranch(projectPath, branchName); } catch { /* best effort */ }
  }, [projectPath]);

  const buildTaskInWorktree = useCallback(
    async (task: Task, idx: number, myRunId: number): Promise<{ branchName: string; worktreePath: string }> => {
      taskStartTimesRef.current.set(task.id, Date.now());
      const isStale = () => myRunId !== runIdRef.current;
      const branchName = task.branchName || `feature/task-${idx + 1}-${slugify(task.title)}`;
      const projectSlug = currentProject!.slug;
      const worktreePath = `/tmp/houston-worktrees/${projectSlug}/task-${task.id}`;
      const chatId = `build-${task.id}-${Date.now()}`;

      updateActiveTask(task.id, { phase: 'branching', branchName, worktreePath, chatId });

      // Create worktree from main
      await window.api.github.createWorktree(projectPath, worktreePath, branchName, 'main');
      updateTask(task.id, { buildPhase: 'branched', branchName });
      addGitEvent({ type: 'branch_created', taskId: task.id, taskTitle: task.title, branchName });

      // Install dependencies in the worktree (node_modules is gitignored, so worktrees start without it)
      try {
        await window.api.github.runShellCommand(worktreePath, 'npm install');
      } catch {
        // Non-fatal — project may not have a package.json, or deps may not be needed for this task
      }

      if (!isMountedRef.current || isStale()) throw new Error('Pipeline cancelled');

      // BUILDING
      updateActiveTask(task.id, { phase: 'building' });
      const prd = await window.api.storage.getPRD(currentProject!.slug);
      const context = prd || currentProject!.idea || '';
      const buildPrompt = `I'm building "${currentProject!.name}".\n\n## Context\n${context}\n\n## Your Task\nTask ${idx + 1} of ${tasks.length}: ${task.title}${task.description ? `\nDetails: ${task.description}` : ''}\n\nBuild this task completely. Do not work on anything else.`;

      // Register per-task output handler — accumulates into buffer, flushed to state at 2Hz
      const appendOutput = (content: string) => {
        const buf = taskOutputBuffersRef.current;
        buf.set(task.id, (buf.get(task.id) || '') + content);
      };
      builderAgent.onChatOutputForTask(chatId, appendOutput);
      buildChatIdsRef.current.add(chatId);

      // Token tracking for this task
      let buildTokens: TokenCount | undefined;
      let reviewTokens: TokenCount | undefined;
      let fixTokens: TokenCount | undefined;

      try {
        const buildResult = await retryOnTimeout(() => builderAgent.chat(worktreePath, buildPrompt, 10 * 60 * 1000, chatId), 2, `build:${task.title}`);
        buildTokens = extractTokens(buildResult);
        accumulateTokens(buildResult);
      } finally {
        builderAgent.offChatOutputForTask(chatId);
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
    },
    [projectPath, currentProject, tasks, isMountedRef, updateTask, addGitEvent, updateActiveTask, extractTokens, accumulateTokens, builderAgent, reviewerAgent]
  );

  const mergeTaskFromWorktree = useCallback(
    async (task: Task, branchName: string, worktreePath: string): Promise<void> => {
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
      notifyHoustonBuildComplete(task.title);
      removeActiveTask(task.id);
    },
    [projectPath, addGitEvent, updateTask, notifyHoustonBuildComplete, removeActiveTask]
  );

  // ─── CORE PIPELINE (checkpoint-aware, used for single-task tiers) ───
  const runTaskPipeline = useCallback(
    async (task: Task, idx: number, retryFromScratch = false, myRunId?: number) => {
      taskStartTimesRef.current.set(task.id, Date.now());
      const currentRunId = myRunId ?? runIdRef.current;
      const isStale = () => currentRunId !== runIdRef.current;
      const branchName = task.branchName || `feature/task-${idx + 1}-${slugify(task.title)}`;
      let level = retryFromScratch ? 0 : completedPhaseLevel(task);

      try {
        // ── BRANCHING (level < 1) ─────────────────────────────
        if (level < 1) {
          if (!isMountedRef.current || isStale()) return;
          setTaskPhase('branching');
          setCurrentBranch(branchName);
          setReviewArtifact(null);
          setReviewOutput('');

          const exists = await window.api.github.branchExists(projectPath, branchName);
          if (exists) {
            // Reuse existing branch — checkout without recreating
            await retryWithBackoff(() => window.api.github.checkoutBranch(projectPath, branchName));
          } else {
            // Fresh branch — ensure we're on main first
            await retryWithBackoff(() => window.api.github.resetWorkingTree(projectPath));
            await retryWithBackoff(() => window.api.github.checkoutBranch(projectPath, 'main'));
            await window.api.github.createAndCheckoutBranch(projectPath, branchName);
            addGitEvent({ type: 'branch_created', taskId: task.id, taskTitle: task.title, branchName });
          }

          updateTask(task.id, { buildPhase: 'branched', branchName });
          level = 1;
          await checkPause();
        } else {
          // Resuming a task with level >= 1 — validate branch still exists
          if (level < 4) {
            const exists = await window.api.github.branchExists(projectPath, branchName);
            if (!exists) {
              // Branch was deleted externally — clear checkpoints and restart from scratch
              console.warn(`[BuildPipeline] Branch "${branchName}" gone, restarting task from scratch`);
              updateTask(task.id, { buildPhase: undefined, branchName: undefined, lastReviewArtifact: undefined });
              if (!retryFromScratch) {
                return runTaskPipeline({ ...task, buildPhase: undefined, branchName: undefined }, idx, true, currentRunId);
              }
              throw new Error(`Branch "${branchName}" was deleted externally and could not be recovered.`);
            }
            // Branch exists — checkout to it
            setCurrentBranch(branchName);
            setReviewArtifact(task.lastReviewArtifact || null);
            setReviewOutput('');
            await retryWithBackoff(() => window.api.github.checkoutBranch(projectPath, branchName));
          }
        }

        // Token tracking for sequential pipeline
        let seqBuildTokens: TokenCount | undefined;
        let seqReviewTokens: TokenCount | undefined;
        let seqFixTokens: TokenCount | undefined;

        // ── BUILDING + COMMITTING (level < 2) ────────────────
        if (level < 2) {
          if (!isMountedRef.current || isStale()) return;
          setTaskPhase('building');
          setSessionActive(true);

          const prd = await window.api.storage.getPRD(currentProject!.slug);
          const totalTasks = tasks.length;
          const context = prd || currentProject!.idea || '';
          const buildPrompt = `I'm building "${currentProject!.name}".

## Context
${context}

## Your Task
Task ${idx + 1} of ${totalTasks}: ${task.title}${task.description ? `\nDetails: ${task.description}` : ''}

Build this task completely. Do not work on anything else.`;

          console.log('[BuildPipeline] Sending build prompt via chat API, length:', buildPrompt.length);
          const seqBuildChatId = `build-${task.id}-${Date.now()}`;
          buildChatIdsRef.current.add(seqBuildChatId);
          const buildResult = await retryOnTimeout(() => builderAgent.chat(projectPath, buildPrompt, 10 * 60 * 1000, seqBuildChatId), 2, `build:${task.title}`);
          seqBuildTokens = extractTokens(buildResult);
          accumulateTokens(buildResult);
          console.log('[BuildPipeline] Chat completed for task:', task.title);

          setSessionActive(false);

          // COMMITTING
          if (!isMountedRef.current || isStale()) return;
          setTaskPhase('committing');
          const commitResult = await retryWithBackoff(() => window.api.github.gitAddAndCommit(projectPath, `feat: ${task.title}`));
          addGitEvent({ type: 'committed', taskId: task.id, taskTitle: task.title, branchName, commitHash: commitResult.commitHash, commitMessage: `feat: ${task.title}` });

          updateTask(task.id, { buildPhase: 'built' });
          level = 2;
          await checkPause();
        }

        // ── REVIEWING + FIXING (level < 3) ───────────────────
        if (level < 3) {
          if (!isMountedRef.current || isStale()) return;
          setTaskPhase('reviewing');

          const diff = await window.api.github.getDiff(projectPath, 'main');

          let artifact: ReviewArtifact;

          if (diff.trim().length === 0) {
            // Empty diff — skip review, merge is a no-op
            artifact = {
              taskId: task.id,
              taskTitle: task.title,
              branchName,
              findings: [],
              summary: 'No changes detected.',
              autoFixApplied: false,
              canAutoFix: true,
              diffStat: '0 files changed',
              timestamp: new Date().toISOString(),
            };
            setReviewArtifact(artifact);
            setReviewHistory((prev) => [...prev, artifact]);
          } else {
            let diffStat = '';
            try {
              diffStat = await window.api.github.getDiffStat(projectPath, 'main');
            } catch {
              diffStat = 'unable to compute';
            }

            // Stream review output via per-task handler
            setReviewOutput('');
            const seqReviewChatId = `review-${task.id}-${Date.now()}`;
            buildChatIdsRef.current.add(seqReviewChatId);
            reviewerAgent.onChatOutputForTask(seqReviewChatId, (content: string) => {
              if (!isMountedRef.current) return;
              setReviewOutput((prev) => prev + content);
            });

            let reviewResult;
            try {
              reviewResult = await retryOnTimeout(
                () => reviewerAgent.chat(projectPath, buildReviewPrompt(task, diff), 10 * 60 * 1000, seqReviewChatId),
                1, `review:${task.title}`
              );
            } finally {
              reviewerAgent.offChatOutputForTask(seqReviewChatId);
            }
            seqReviewTokens = extractTokens(reviewResult);
            accumulateTokens(reviewResult);

            artifact = parseReviewResponse(reviewResult.response, task, branchName, diffStat);
            setReviewArtifact(artifact);
            addGitEvent({ type: 'review_completed', taskId: task.id, taskTitle: task.title, branchName, reviewArtifact: artifact });

            // FIXING (if needed)
            if (hasFixableIssues(artifact)) {
              if (!isMountedRef.current || isStale()) return;
              setTaskPhase('fixing');

              setReviewOutput('');
              const seqFixChatId = `fix-${task.id}-${Date.now()}`;
              buildChatIdsRef.current.add(seqFixChatId);
              const fixResult = await retryOnTimeout(
                () => reviewerAgent.chat(projectPath, buildFixPrompt(artifact), 10 * 60 * 1000, seqFixChatId),
                1, `fix:${task.title}`
              );
              seqFixTokens = extractTokens(fixResult);
              accumulateTokens(fixResult);

              // Mark findings as fixed based on what the reviewer said is auto-fixable
              artifact.findings = artifact.findings.map((f) => {
                if (f.severity === 'warning') return { ...f, fixed: true };
                if (f.severity === 'critical' && artifact.canAutoFix) return { ...f, fixed: true };
                return f;
              });
              artifact.autoFixApplied = true;
              setReviewArtifact({ ...artifact });

              const fixCommit = await window.api.github.gitAddAndCommit(
                projectPath,
                `fix: review findings for ${task.title}`
              );
              addGitEvent({ type: 'auto_fixed', taskId: task.id, taskTitle: task.title, branchName, commitHash: fixCommit.commitHash, commitMessage: `fix: review findings for ${task.title}` });
            }

            if (hasCriticalUnfixable(artifact)) {
              const unfixable = artifact.findings
                .filter((f) => f.severity === 'critical' && !f.fixed)
                .map((f) => f.description)
                .join('; ');
              console.warn('[BuildPipeline] Critical unfixable issues (continuing):', unfixable);
            }

            setReviewHistory((prev) => [...prev, artifact]);
          }

          // Save per-task token usage
          const seqTotalInput = (seqBuildTokens?.input ?? 0) + (seqReviewTokens?.input ?? 0) + (seqFixTokens?.input ?? 0);
          const seqTotalOutput = (seqBuildTokens?.output ?? 0) + (seqReviewTokens?.output ?? 0) + (seqFixTokens?.output ?? 0);
          if (seqTotalInput > 0 || seqTotalOutput > 0) {
            const tokenUsage: TaskTokenUsage = {
              build: seqBuildTokens,
              review: seqReviewTokens,
              fix: seqFixTokens,
              total: { input: seqTotalInput, output: seqTotalOutput },
              buildAgent: builderAgent.provider,
              reviewAgent: reviewerAgent.provider,
            };
            updateTask(task.id, { buildPhase: 'reviewed', lastReviewArtifact: artifact, tokenUsage });
          } else {
            updateTask(task.id, { buildPhase: 'reviewed', lastReviewArtifact: artifact });
          }
          level = 3;
          await checkPause();
        }

        // ── MERGING + PUSHING (level < 4) ────────────────────
        if (level < 4) {
          if (!isMountedRef.current || isStale()) return;
          setTaskPhase('merging');
          await retryWithBackoff(() => window.api.github.checkoutBranch(projectPath, 'main'));
          await window.api.github.mergeBranch(projectPath, branchName);
          await window.api.github.deleteBranch(projectPath, branchName);
          setCurrentBranch('main');
          addGitEvent({ type: 'merged', taskId: task.id, taskTitle: task.title, branchName });

          // PUSHING
          if (!isMountedRef.current || isStale()) return;
          setTaskPhase('pushing');
          try {
            const gitStatus = await window.api.github.checkGitStatus(projectPath);
            if (gitStatus.hasRemote) {
              await window.api.github.gitPush(projectPath);
              addGitEvent({ type: 'pushed', taskId: task.id, taskTitle: task.title });
            }
          } catch {
            // Push failure is non-fatal; DeployScreen handles initial push
          }

          // COMPLETE
          if (!isMountedRef.current || isStale()) return;
          setTaskPhase('complete');
          updateTask(task.id, { buildPhase: 'merged', completed: true });
          notifyHoustonBuildComplete(task.title);
        }
      } catch (err) {
        if (!isMountedRef.current || isStale()) return;
        console.error(`[BuildPipeline] Pipeline error for task "${task.title}":`, err);

        // Best-effort recovery to main — but don't destroy feature branch work
        try {
          await window.api.github.resetWorkingTree(projectPath);
          await window.api.github.checkoutBranch(projectPath, 'main');
          setCurrentBranch('main');
        } catch {
          // Best effort recovery
        }

        // Re-throw so the tier loop can decide whether to demote or stop
        throw err;
      }
    },
    [
      projectPath,
      currentProject,
      tasks,
      isMountedRef,
      updateTask,
      addGitEvent,
      setTaskPhase,
      setCurrentTaskId,
      setSessionActive,
      notifyHoustonBuildComplete,
      notifyHoustonBuildError,
      checkPause,
      extractTokens,
      accumulateTokens,
      builderAgent,
      reviewerAgent,
    ]
  );

  // Handle build completion
  const handleBuildComplete = useCallback(async () => {
    try {
      await updateProject({ status: 'previewing', hasBuiltOnce: true });
      if (!isMountedRef.current) return;
      goToPreview();
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error('Failed to update project status:', err);
      setError(classifyError('Failed to proceed to preview. Please try again.'));
    }
  }, [updateProject, goToPreview, isMountedRef]);

  // ─── Tier boundary reconciliation ─────────────────────────────
  const reconcileTierBoundary = useCallback(async (pp: string) => {
    // Ensure we're on main
    await window.api.github.checkoutBranch(pp, 'main');

    // Run npm install to sync dependencies
    try {
      await window.api.github.runShellCommand(pp, 'npm install');
    } catch {
      // Non-fatal — dependencies might already be fine
    }

    // Commit any infrastructure file changes
    try {
      await window.api.github.gitAddAndCommit(pp, 'chore: reconcile dependencies after tier');
    } catch {
      // No changes to commit — that's fine
    }
  }, []);

  // ─── MAIN PIPELINE LOOP (tier-based) ────────────────────────────
  const runAllTasks = useCallback(async () => {
    if (!currentProject || pipelineStartedRef.current || !agentConfigLoaded) return;
    pipelineStartedRef.current = true;
    pipelineErrorRef.current = false;
    stopAfterTierRef.current = false;
    setStopRequested(false);
    setFailedTaskIds([]);

    // Reset token tracking state
    setBuildTokens({ input: 0, output: 0 });
    setBuildCostUsd(0);
    setBuildMetrics(null);
    buildStartTimeRef.current = Date.now();
    taskStartTimesRef.current = new Map();
    retriedCountRef.current = 0;

    // Increment run ID — any previous loop checking this will see it's stale and bail
    const myRunId = ++runIdRef.current;
    const isStale = () => myRunId !== runIdRef.current;

    const incompleteTasks = tasks.filter((t) => !t.completed);

    // Set currentTaskId to first incomplete task so UI has context if ensureGitRepo fails
    if (incompleteTasks.length > 0) {
      setCurrentTaskId(incompleteTasks[0].id);
    }

    try {
      await ensureGitRepo();
    } catch (err) {
      console.error('[BuildPipeline] Git init failed:', err);
      const rawMsg = err instanceof Error ? err.message : 'Failed to initialize git';
      setError(classifyError(rawMsg));
      setTaskPhase('error');
      pipelineErrorRef.current = true;
      pipelineStartedRef.current = false;
      return;
    }

    // Clean up any stale worktrees from previous runs
    await cleanupStaleWorktrees();

    // Compute tier plan from current tasks
    const tierPlan = computeTierPlan(tasks);
    setTotalTiers(tierPlan.tiers.length);

    interface DemotedTask {
      task: Task;
      attempts: number;
      lastError: string;
    }

    let demotedTasks: DemotedTask[] = [];
    const allFailedIds: string[] = [];

    for (let tierIdx = 0; tierIdx < tierPlan.tiers.length; tierIdx++) {
      if (!isMountedRef.current || pipelineErrorRef.current || isStale()) break;

      const tierGroup = tierPlan.tiers[tierIdx];
      setCurrentTier(tierIdx);

      // Build task list for this tier: scheduled tasks + any demoted from previous tier
      const scheduledTasks = tierGroup.taskIds
        .map(id => tasks.find(t => t.id === id))
        .filter((t): t is Task => t !== undefined && !t.completed);

      const tierTasks = [
        ...demotedTasks.map(d => d.task),
        ...scheduledTasks,
      ];

      // Track demoted tasks for this tier so we know their attempt count
      const demotedMap = new Map(demotedTasks.map(d => [d.task.id, d]));
      demotedTasks = []; // Reset for next tier

      setTierTasksTotal(tierTasks.length);
      setTierTasksComplete(0);

      let tierCompletedCount = 0;

      const handleTaskFailure = (task: Task, dMap: Map<string, DemotedTask>, reason: unknown) => {
        const rawMsg = reason instanceof Error ? reason.message : String(reason);
        const demoted = dMap.get(task.id);
        const attempts = (demoted?.attempts ?? 0) + 1;

        retriedCountRef.current++;
        if (attempts >= 2) {
          console.error(`[BuildPipeline] Task "${task.title}" failed twice, marking as failed`);
          allFailedIds.push(task.id);
          setFailedTaskIds(prev => [...prev, task.id]);
          updateTask(task.id, { completed: true, buildPhase: 'merged' });
        } else {
          console.warn(`[BuildPipeline] Task "${task.title}" failed, demoting to next tier`);
          demotedTasks.push({ task, attempts, lastError: rawMsg });
        }
      };

      // Single-task tiers use the existing sequential pipeline (no worktree overhead)
      if (tierTasks.length === 1) {
        const task = tierTasks[0];
        if (!isMountedRef.current || pipelineErrorRef.current || isStale()) break;

        const idx = tasks.findIndex(t => t.id === task.id);
        setCurrentTaskId(task.id);

        try {
          await runTaskPipeline(task, idx >= 0 ? idx : tierIdx * 10, false, myRunId);
          if (!isMountedRef.current || pipelineErrorRef.current || isStale()) break;
          tierCompletedCount++;
          setTierTasksComplete(tierCompletedCount);
        } catch (err) {
          if (!isMountedRef.current || isStale()) break;
          const prevFailedCount = allFailedIds.length;
          handleTaskFailure(task, demotedMap, err);
          // Only bump tier count if the task was permanently failed (not demoted)
          if (allFailedIds.length > prevFailedCount) {
            tierCompletedCount++;
            setTierTasksComplete(tierCompletedCount);
          }
        }
      } else {
        // Multi-task tiers: execute in parallel batches using worktrees
        const CONCURRENCY_CAP = 3;

        for (let batchStart = 0; batchStart < tierTasks.length; batchStart += CONCURRENCY_CAP) {
          if (!isMountedRef.current || pipelineErrorRef.current || isStale()) break;

          const batch = tierTasks.slice(batchStart, batchStart + CONCURRENCY_CAP);

          // Launch all tasks in batch concurrently
          const results = await Promise.allSettled(
            batch.map((task) => {
              const idx = tasks.findIndex(t => t.id === task.id);
              return buildTaskInWorktree(task, idx >= 0 ? idx : tierIdx * 10, myRunId);
            })
          );

          // Separate successes and failures
          const successes: { task: Task; branchName: string; worktreePath: string }[] = [];

          results.forEach((result, i) => {
            if (result.status === 'fulfilled') {
              successes.push({ task: batch[i], ...result.value });
            } else {
              // Clean up failed worktree
              const failedSlug = currentProject!.slug;
              const failedWorktree = `/tmp/houston-worktrees/${failedSlug}/task-${batch[i].id}`;
              const globalIdx = tasks.findIndex(t => t.id === batch[i].id);
              const failedBranch = batch[i].branchName || `feature/task-${(globalIdx >= 0 ? globalIdx : i) + 1}-${slugify(batch[i].title)}`;
              cleanupFailedWorktree(failedWorktree, failedBranch);
              removeActiveTask(batch[i].id);

              handleTaskFailure(batch[i], demotedMap, result.reason);
            }
          });

          // Merge successes sequentially in the main repo
          for (const { task, branchName, worktreePath } of successes) {
            if (!isMountedRef.current || pipelineErrorRef.current || isStale()) break;
            updateActiveTask(task.id, { phase: 'merging' });
            try {
              await mergeTaskFromWorktree(task, branchName, worktreePath);
              tierCompletedCount++;
              setTierTasksComplete(tierCompletedCount);
            } catch {
              // Merge conflict — demote this task
              cleanupFailedWorktree(worktreePath, branchName);
              removeActiveTask(task.id);
              handleTaskFailure(task, demotedMap, 'merge conflict');
            }
          }
        }
      }

      if (!isMountedRef.current || pipelineErrorRef.current || isStale()) break;

      // Tier boundary reconciliation
      try {
        await reconcileTierBoundary(projectPath);
      } catch (err) {
        console.warn('[BuildPipeline] Tier reconciliation error (non-fatal):', err);
      }

      // Check stop-after-tier flag
      if (stopAfterTierRef.current) {
        console.log('[BuildPipeline] Stop after tier requested, pausing');
        break;
      }

      // User approval between tiers (if not auto-approve)
      const remainingTiers = tierPlan.tiers.length - tierIdx - 1 + (demotedTasks.length > 0 ? 1 : 0);
      if (!autoApproveRef.current && remainingTiers > 0) {
        pauseRequestedRef.current = true;
        const completedSoFar = tasks.filter(t => t.completed).length;
        projectStoreApi.getState().notifyHoustonTaskApproval(
          `Tier ${tierIdx + 1}`,
          completedSoFar,
          tasks.length,
          tasks.length - completedSoFar
        );
      }

      // Mid-operation health check between tiers — check agents actually in use
      try {
        const healthCheck = await window.api.cli.checkAll();
        const needsGitHub = !healthCheck.github?.authenticated;
        const needsClaude = (builderAgent.provider === 'claude' || reviewerAgent.provider === 'claude')
          && !healthCheck.claude?.authenticated;
        const needsCodex = (builderAgent.provider === 'codex' || reviewerAgent.provider === 'codex')
          && !healthCheck.codex?.authenticated;
        if (needsGitHub || needsClaude || needsCodex) {
          setPreflightNeeded(true);
          await new Promise<void>((resolve) => { preflightResolveRef.current = resolve; });
        }
      } catch {
        // Health check failure is non-fatal
      }

      // Check if user requested a pause between tiers
      await checkPause();
    }

    // Handle any demoted tasks that couldn't be placed in a next tier
    // (failed in the final tier — give them one more try)
    if (demotedTasks.length > 0 && !pipelineErrorRef.current && !isStale() && isMountedRef.current) {
      for (const { task, attempts } of demotedTasks) {
        if (!isMountedRef.current || pipelineErrorRef.current || isStale()) break;
        const idx = tasks.findIndex(t => t.id === task.id);
        setCurrentTaskId(task.id);

        try {
          await runTaskPipeline(task, idx >= 0 ? idx : 0, false, myRunId);
        } catch {
          // Final attempt failed — mark permanently failed
          allFailedIds.push(task.id);
          setFailedTaskIds(prev => [...prev, task.id]);
          updateTask(task.id, { completed: true, buildPhase: 'merged' });
        }
      }
    }

    // Drain tasks added during the build (e.g., Design Duel task)
    if (!pipelineErrorRef.current && !isStale() && isMountedRef.current) {
      const freshTasks = projectStoreApi.getState().tasks;
      const newUncompleted = freshTasks.filter(t => !t.completed);
      for (const task of newUncompleted) {
        if (!isMountedRef.current || pipelineErrorRef.current || isStale()) break;
        setCurrentTaskId(task.id);
        try {
          await runTaskPipeline(task, freshTasks.indexOf(task), false, myRunId);
        } catch (err) {
          // Non-critical — just skip dynamically added tasks that fail
          console.warn('[BuildPipeline] Dynamic task failed:', err);
        }
        if (!isMountedRef.current || pipelineErrorRef.current || isStale()) break;
        await checkPause();
      }
    }

    // Surface failed tasks to Houston
    if (allFailedIds.length > 0 && isMountedRef.current) {
      const failedNames = allFailedIds.map(id => tasks.find(t => t.id === id)?.title || id);
      notifyHoustonBuildError('Build', `${allFailedIds.length} task(s) failed: ${failedNames.join(', ')}`);
    }

    pipelineStartedRef.current = false;

    // Compute aggregate build metrics
    if (isMountedRef.current && !isStale()) {
      const freshTasks = projectStoreApi.getState().tasks;
      const completedCount = freshTasks.filter(t => t.completed).length;
      const metrics: BuildMetrics = {
        totalTokens: { ...buildTokens },
        totalCostUsd: buildCostUsd,
        taskMetrics: freshTasks
          .filter(t => t.tokenUsage)
          .map(t => ({
            taskId: t.id,
            taskTitle: t.title,
            tokens: t.tokenUsage!,
            wallClockMs: taskStartTimesRef.current.has(t.id)
              ? Date.now() - taskStartTimesRef.current.get(t.id)!
              : 0,
            tier: t.tier ?? 0,
          })),
        wallClockMs: Date.now() - buildStartTimeRef.current,
        tiersExecuted: tierPlan.tiers.length,
        tasksCompleted: completedCount,
        tasksFailed: allFailedIds.length,
        tasksRetried: retriedCountRef.current,
      };
      setBuildMetrics(metrics);
    }

    // All tasks done — check fresh store state
    if (!isMountedRef.current || pipelineErrorRef.current || isStale()) return;
    const finalTasks = projectStoreApi.getState().tasks;
    if (finalTasks.every(t => t.completed)) {
      handleBuildComplete();
    }
  }, [currentProject, tasks, isMountedRef, ensureGitRepo, runTaskPipeline, buildTaskInWorktree, mergeTaskFromWorktree, cleanupStaleWorktrees, cleanupFailedWorktree, reconcileTierBoundary, handleBuildComplete, setTaskPhase, setCurrentTaskId, checkPause, projectPath, updateTask, updateActiveTask, removeActiveTask, notifyHoustonBuildError, buildTokens, buildCostUsd, agentConfigLoaded]);


  // Resume pipeline after preflight check passes
  const resumeAfterPreflight = useCallback(() => {
    setPreflightNeeded(false);
    if (preflightResolveRef.current) {
      preflightResolveRef.current();
      preflightResolveRef.current = null;
    }
  }, []);

  // Retry current task after error
  const handleRetry = useCallback(() => {
    if (pipelineStartedRef.current) return; // Prevent concurrent loops
    setError(null);
    setTaskPhase('idle');
    pipelineErrorRef.current = false;
    runAllTasks();
  }, [runAllTasks]);

  // Skip the current task after error and continue with remaining tasks
  const handleSkipTask = useCallback(() => {
    if (!currentTaskId) return;
    // Mark the task as completed (skipped) so it won't be retried
    updateTask(currentTaskId, { completed: true, buildPhase: 'merged' });
    setError(null);
    setTaskPhase('idle');
    pipelineErrorRef.current = false;
    pipelineStartedRef.current = false;
    runAllTasks();
  }, [currentTaskId, updateTask, runAllTasks]);

  // Set auto-approve mode (skip pausing between tiers)
  const setAutoApprove = useCallback((value: boolean) => {
    autoApproveRef.current = value;
  }, []);

  // Request stop after current tier completes
  const requestStopAfterTier = useCallback(() => {
    stopAfterTierRef.current = true;
    setStopRequested(true);
  }, []);

  // Cleanup: stop the loop, kill orphaned processes, preserve branch state for resume
  const cleanupAndRestoreMain = useCallback(async () => {
    setSessionActive(false);
    pipelineErrorRef.current = true; // stop the loop if still running
    pipelineStartedRef.current = false;
    runIdRef.current++; // invalidate any in-flight loop iterations
    // Clear any pending pause, auto-approve, and stop requests
    pauseRequestedRef.current = false;
    autoApproveRef.current = false;
    stopAfterTierRef.current = false;
    setStopRequested(false);
    setPaused(false);
    if (pauseResolverRef.current) {
      pauseResolverRef.current();
      pauseResolverRef.current = null;
    }
    // Kill only build-owned chat processes to prevent orphans (scoped cancellation)
    try {
      await cancelBuildAgents(Array.from(buildChatIdsRef.current));
      buildChatIdsRef.current.clear();
    } catch {
      // Best effort
    }
    // Clean up any worktrees
    try { await cleanupStaleWorktrees(); } catch { /* best effort */ }
    // Clear active tasks map and output buffers
    setActiveTasksMap(new Map());
    taskOutputBuffersRef.current.clear();
  }, [setSessionActive, cleanupStaleWorktrees]);

  const handleEndBuild = useCallback(async () => {
    const confirmed = window.confirm(
      completedTasks < tasks.length
        ? `You have ${tasks.length - completedTasks} tasks remaining. End build and preview your app?`
        : 'End build session and preview your app?'
    );
    if (!confirmed) return;

    await cleanupAndRestoreMain();
    handleBuildComplete();
  }, [completedTasks, tasks.length, cleanupAndRestoreMain, handleBuildComplete]);

  const handleNavigateBack = useCallback(async () => {
    if (sessionActive || taskPhase === 'building') {
      const confirmed = window.confirm(
        'A build session is currently active. Are you sure you want to leave?'
      );
      if (!confirmed) return;
    } else if (completedTasks < tasks.length) {
      const confirmed = window.confirm(
        `You have ${tasks.length - completedTasks} tasks remaining. Are you sure you want to leave?`
      );
      if (!confirmed) return;
    }

    await cleanupAndRestoreMain();
    goToPlanning();
  }, [sessionActive, taskPhase, completedTasks, tasks.length, cleanupAndRestoreMain, goToPlanning]);

  // NOTE: Auto-start removed — BuildScreen calls runAllTasks via preflight.runGuarded
  // NOTE: No PTY session management needed — build uses headless claude.chat() API

  return {
    // State
    taskPhase,
    currentBranch,
    reviewArtifact,
    reviewHistory,
    reviewOutput,
    paused,
    sessionActive,
    currentTaskId,
    error,
    currentTask,
    completedTasks,
    projectPath,
    preflightNeeded,
    activeTasksMap,
    // Tier state
    currentTier,
    totalTiers,
    tierTasksComplete,
    tierTasksTotal,
    stopRequested,
    failedTaskIds,
    // Token tracking (Phase 4)
    buildTokens,
    buildCostUsd,
    buildMetrics,

    // Actions
    runAllTasks,
    resumeAfterPreflight,
    togglePause,
    handleRetry,
    handleSkipTask,
    handleEndBuild,
    handleNavigateBack,
    setAutoApprove,
    requestStopAfterTier,
  };
}
