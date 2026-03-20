import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useProjectStore, useProjectStoreApi } from '../store/ProjectStoreContext';
import { useIsMounted } from './useIsMounted';
import type { Task, TaskPhase, ReviewArtifact, TaskPipelineStatus, TokenCount, TaskTokenUsage, BuildMetrics, ChatResult, AgentRoleConfig, DecisionRequest, ResolvedDecision } from '../types';
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
import { queueAssistantMessage } from '../utils/assistant-chat-state';

// Sub-modules
export type { BuildPipelineState, BuildPipelineActions } from './build-pipeline/types';
import { PHASE_ORDER, completedPhaseLevel } from './build-pipeline/types';
import { retryWithBackoff, retryOnTimeout } from './build-pipeline/retry-utils';
import { extractTokens as extractTokensHelper, computeFinalBuildMetrics } from './build-pipeline/token-tracking';
import {
  cleanupStaleWorktrees as cleanupStaleWorktreesOp,
  cleanupFailedWorktree as cleanupFailedWorktreeOp,
  buildTaskInWorktree as buildTaskInWorktreeOp,
  mergeTaskFromWorktree as mergeTaskFromWorktreeOp,
  type WorktreeDeps,
} from './build-pipeline/worktree-ops';
import { buildWithDecisionLoop, createDecisionGate, effectiveConcurrencyCap, effectiveDepth } from './build-pipeline/decision-loop';

export function useBuildPipeline() {
  // Only subscribe to reactive values individually
  const currentProject = useProjectStore(s => s.currentProject);
  const tasks = useProjectStore(s => s.tasks);
  const flowTestMode = useProjectStore(s => s.flowTestMode);
  const oneOffBacklogItemId = useProjectStore(s => s.oneOffBacklogItemId);
  const projectStoreApi = useProjectStoreApi();

  // Stable action accessors — read from store at call time (inside callbacks), never stale.
  // These replace the old blanket destructure which subscribed to all 16 fields.
  const updateTask = useCallback((...args: Parameters<ReturnType<typeof projectStoreApi.getState>['updateTask']>) => projectStoreApi.getState().updateTask(...args), [projectStoreApi]);
  const updateProject = useCallback((...args: Parameters<ReturnType<typeof projectStoreApi.getState>['updateProject']>) => projectStoreApi.getState().updateProject(...args), [projectStoreApi]);
  const goToPlanning = useCallback(() => projectStoreApi.getState().goToPlanning(), [projectStoreApi]);
  const goToPreview = useCallback(() => projectStoreApi.getState().goToPreview(), [projectStoreApi]);
  const addGitEvent = useCallback((...args: Parameters<ReturnType<typeof projectStoreApi.getState>['addGitEvent']>) => projectStoreApi.getState().addGitEvent(...args), [projectStoreApi]);
  const notifyAssistantBuildComplete = useCallback((title: string) => projectStoreApi.getState().notifyAssistantBuildComplete(title), [projectStoreApi]);
  const notifyAssistantBuildError = useCallback((taskTitle: string, errorHint: string, errorOutput?: string) => projectStoreApi.getState().notifyAssistantBuildError(taskTitle, errorHint, errorOutput), [projectStoreApi]);
  const setOneOffBacklogItemId = useCallback((id: string | null) => projectStoreApi.getState().setOneOffBacklogItemId(id), [projectStoreApi]);
  const loadTasks = useCallback(() => projectStoreApi.getState().loadTasks(), [projectStoreApi]);
  const updateBacklogItem = useCallback((...args: Parameters<ReturnType<typeof projectStoreApi.getState>['updateBacklogItem']>) => projectStoreApi.getState().updateBacklogItem(...args), [projectStoreApi]);

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
      autoApproveRef.current = !(config.pauseBetweenTiers ?? false);
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
  const syncBuildChatIds = useCallback(() => {
    projectStoreApi.getState().setActiveBuildChatIds(Array.from(buildChatIdsRef.current));
  }, [projectStoreApi]);

  // Decision resolvers: taskId → resolve function (for pending decision gates)
  const decisionResolversRef = useRef<Map<string, (response: string) => void>>(new Map());

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
    projectStoreApi.getState().setBuildTaskPhase(phase);
  }, [projectStoreApi]);

  const setCurrentTaskId = useCallback((id: string | null) => {
    setCurrentTaskIdLocal(id);
    projectStoreApi.getState().setBuildCurrentTaskId(id);
  }, [projectStoreApi]);

  const setSessionActive = useCallback((active: boolean) => {
    setSessionActiveLocal(active);
    projectStoreApi.getState().setBuildSessionActive(active);
  }, [projectStoreApi]);
  const [preflightNeeded, setPreflightNeeded] = useState(false);
  const preflightResolveRef = useRef<(() => void) | null>(null);

  // Per-task Map for concurrent tracking (Phase 3)
  const [activeTasksMap, setActiveTasksMap] = useState<Map<string, TaskPipelineStatus>>(new Map());
  const activeTasksMapRef = useRef<Map<string, TaskPipelineStatus>>(activeTasksMap);
  useEffect(() => { activeTasksMapRef.current = activeTasksMap; }, [activeTasksMap]);

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

  // Auto-approve: when true (default), pipeline continues between tiers without pausing
  const autoApproveRef = useRef(true);

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

  // Token helpers from sub-module
  const extractTokens = extractTokensHelper;
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

  // Register pipeline callbacks in store so Assistant directives can control the pipeline
  useEffect(() => {
    const store = projectStoreApi.getState();
    store.setBuildPipelineResume(() => togglePause());
    store.setBuildPipelineAutoApprove((v: boolean) => {
      autoApproveRef.current = v;
      if (v) togglePause();
    });
    return () => {
      const s = projectStoreApi.getState();
      s.setBuildPipelineResume(null);
      s.setBuildPipelineAutoApprove(null);
    };
  }, [togglePause, projectStoreApi]);

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
        await window.api.github.ensureGitConfig(projectPath, 'mission-control');
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

  // ─── WORKTREE-BASED PARALLEL PIPELINE (Phase 3) — delegated to sub-module ───
  const worktreeDeps = useMemo((): WorktreeDeps => ({
    projectPath,
    currentProject: currentProject!,
    tasks,
    isMountedRef,
    runIdRef,
    updateTask: (id, updates) => projectStoreApi.getState().updateTask(id, updates),
    addGitEvent: (event) => projectStoreApi.getState().addGitEvent(event),
    updateActiveTask,
    removeActiveTask,
    notifyAssistantBuildComplete: (title) => projectStoreApi.getState().notifyAssistantBuildComplete(title),
    builderAgent,
    reviewerAgent,
    taskOutputBuffersRef,
    buildChatIdsRef,
    taskStartTimesRef,
    accumulateTokens,
    decisionResolversRef,
    syncBuildChatIds,
  }), [projectPath, currentProject, tasks, isMountedRef, updateActiveTask, removeActiveTask, builderAgent, reviewerAgent, accumulateTokens, projectStoreApi, syncBuildChatIds]);

  const cleanupStaleWorktrees = useCallback(async () => {
    if (!currentProject) return;
    await cleanupStaleWorktreesOp(currentProject.slug, projectPath);
  }, [currentProject, projectPath]);

  const cleanupFailedWorktree = useCallback(async (worktreePath: string, branchName: string) => {
    await cleanupFailedWorktreeOp(projectPath, worktreePath, branchName);
  }, [projectPath]);

  const buildTaskInWorktree = useCallback(
    (task: Task, idx: number, myRunId: number) => buildTaskInWorktreeOp(task, idx, myRunId, worktreeDeps),
    [worktreeDeps]
  );

  const mergeTaskFromWorktree = useCallback(
    (task: Task, branchName: string, worktreePath: string) => mergeTaskFromWorktreeOp(task, branchName, worktreePath, {
      projectPath,
      addGitEvent: (event) => projectStoreApi.getState().addGitEvent(event),
      updateTask: (id, updates) => projectStoreApi.getState().updateTask(id, updates),
      notifyAssistantBuildComplete: (title) => projectStoreApi.getState().notifyAssistantBuildComplete(title),
      removeActiveTask,
    }),
    [projectPath, projectStoreApi, removeActiveTask]
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
          syncBuildChatIds();

          const depth = effectiveDepth(builderAgent, task);

          if (depth === 'small') {
            // Standard single-shot build
            const buildResult = await retryOnTimeout(() => builderAgent.chat(projectPath, buildPrompt, 10 * 60 * 1000, seqBuildChatId), 2, `build:${task.title}`);
            seqBuildTokens = extractTokens(buildResult);
            accumulateTokens(buildResult);
          } else {
            // Decision-aware build loop for medium/large tasks
            const gate = createDecisionGate();
            decisionResolversRef.current.set(task.id, gate.resolveDecision);

            try {
              await buildWithDecisionLoop(
                builderAgent,
                projectPath,
                buildPrompt,
                task,
                depth,
                seqBuildChatId,
                10 * 60 * 1000,
                {
                  onDecisionDetected: (decision: DecisionRequest) => {
                    setTaskPhase('awaiting_decision');
                    updateTask(task.id, { pendingDecision: decision });
                  },
                  onDecisionResolved: (resolved: ResolvedDecision) => {
                    setTaskPhase('building');
                    updateTask(task.id, {
                      pendingDecision: null,
                      decisionHistory: [
                        ...(task.decisionHistory ?? []),
                        resolved,
                      ],
                    });
                  },
                  waitForDecisionResponse: gate.waitForDecisionResponse,
                },
              );
            } finally {
              decisionResolversRef.current.delete(task.id);
            }
          }
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
            syncBuildChatIds();
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
              syncBuildChatIds();
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
          notifyAssistantBuildComplete(task.title);
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
      notifyAssistantBuildComplete,
      notifyAssistantBuildError,
      checkPause,
      extractTokens,
      accumulateTokens,
      builderAgent,
      reviewerAgent,
    ]
  );

  // ─── Tier boundary reconciliation ─────────────────────────────
  const reconcileTierBoundary = useCallback(async (pp: string) => {
    // Ensure we're on main
    await window.api.github.checkoutBranch(pp, 'main');

    // Run npm install to sync dependencies
    try {
      await window.api.github.runShellCommand(pp, 'npm', ['install']);
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
        // Cap concurrency based on interaction depth (large=1, medium=2, small=3)
        const CONCURRENCY_CAP = effectiveConcurrencyCap(tierTasks);

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
              const failedWorktree = `/tmp/mc-worktrees/${failedSlug}/task-${batch[i].id}`;
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

        // Collect enriched tier info for the assistant
        const tierCompletedTaskTitles = tierTasks
          .filter(t => !allFailedIds.includes(t.id))
          .map(t => t.title);

        let tierDiffStat = '';
        try {
          tierDiffStat = await window.api.github.getDiffStat(projectPath, 'main');
        } catch { tierDiffStat = ''; }

        // Summarize review findings from completed tasks
        const freshState = projectStoreApi.getState();
        const reviewSummaryParts: string[] = [];
        for (const t of tierTasks) {
          const freshTask = freshState.tasks.find(ft => ft.id === t.id);
          const review = freshTask?.lastReviewArtifact;
          if (review?.summary) {
            reviewSummaryParts.push(`${t.title}: ${review.summary}`);
          }
        }
        const tierReviewSummary = reviewSummaryParts.join('\n');

        projectStoreApi.getState().notifyAssistantTaskApproval(
          `Tier ${tierIdx + 1}`,
          completedSoFar,
          tasks.length,
          tasks.length - completedSoFar,
          tierCompletedTaskTitles,
          tierDiffStat,
          tierReviewSummary,
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

    // Surface failed tasks to Assistant with last output
    if (allFailedIds.length > 0 && isMountedRef.current) {
      const failedNames = allFailedIds.map(id => tasks.find(t => t.id === id)?.title || id);
      // Grab last output from the first failed task (flushed state, not transient buffer)
      let errorOutput = '';
      for (const failedId of allFailedIds) {
        const status = activeTasksMapRef.current.get(failedId);
        if (status?.output) {
          const lines = status.output.split('\n');
          errorOutput = lines.slice(-20).join('\n');
          break;
        }
      }
      notifyAssistantBuildError('Build', `${allFailedIds.length} task(s) failed: ${failedNames.join(', ')}`, errorOutput);
    }

    pipelineStartedRef.current = false;

    // Compute aggregate build metrics
    if (isMountedRef.current && !isStale()) {
      const freshTasks = projectStoreApi.getState().tasks;
      const metrics = computeFinalBuildMetrics(
        freshTasks, buildTokens, buildCostUsd,
        buildStartTimeRef.current, taskStartTimesRef.current,
        tierPlan.tiers.length, allFailedIds, retriedCountRef.current,
      );
      setBuildMetrics(metrics);
    }

    // All tasks done — check fresh store state
    if (!isMountedRef.current || pipelineErrorRef.current || isStale()) return;
    const finalTasks = projectStoreApi.getState().tasks;
    if (finalTasks.every(t => t.completed)) {
      handleBuildComplete();
    }
  }, [currentProject, tasks, isMountedRef, ensureGitRepo, runTaskPipeline, buildTaskInWorktree, mergeTaskFromWorktree, cleanupStaleWorktrees, cleanupFailedWorktree, reconcileTierBoundary, handleBuildComplete, setTaskPhase, setCurrentTaskId, checkPause, projectPath, updateTask, updateActiveTask, removeActiveTask, notifyAssistantBuildError, buildTokens, buildCostUsd, agentConfigLoaded]);


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
      syncBuildChatIds();
    } catch {
      // Best effort
    }
    // Clean up any worktrees
    try { await cleanupStaleWorktrees(); } catch { /* best effort */ }
    // Clear active tasks map, output buffers, and decision resolvers
    setActiveTasksMap(new Map());
    taskOutputBuffersRef.current.clear();
    decisionResolversRef.current.clear();
  }, [setSessionActive, cleanupStaleWorktrees]);

  // Handle build completion
  const handleBuildComplete = useCallback(async () => {
    try {
      // Queue proactive assistant message with build summary
      if (currentProject) {
        const freshTasks = projectStoreApi.getState().tasks;
        const completed = freshTasks.filter((t) => t.completed).length;

        let diffStat = '';
        try {
          diffStat = await window.api.github.getDiffStat(currentProject.projectPath, 'main');
        } catch { /* non-fatal */ }

        // Collect review summaries
        const reviewLines: string[] = [];
        for (const t of freshTasks) {
          if (t.lastReviewArtifact?.summary) {
            reviewLines.push(`- **${t.title}**: ${t.lastReviewArtifact.summary}`);
          }
        }

        let summary = `Build complete! ${completed}/${freshTasks.length} tasks succeeded.`;
        if (diffStat) summary += `\n\n**Changes:** ${diffStat}`;
        if (reviewLines.length > 0) summary += `\n\n**Review notes:**\n${reviewLines.join('\n')}`;

        queueAssistantMessage(currentProject.slug, summary);
      }

      // One-off mode: cleanup git state, mark backlog item, restore tasks, go to planning
      if (oneOffBacklogItemId) {
        await cleanupAndRestoreMain();
        updateBacklogItem(oneOffBacklogItemId, {
          notes: `Executed as one-off on ${new Date().toLocaleDateString()}`,
        });
        setOneOffBacklogItemId(null);
        await loadTasks();
        if (!isMountedRef.current) return;
        goToPlanning();
        return;
      }
      await updateProject({ status: 'previewing', hasBuiltOnce: true });

      // Auto-push and create PR if git remote exists
      if (currentProject?.projectPath) {
        try {
          const gitStatus = await window.api.github.checkGitStatus(currentProject.projectPath);
          if (gitStatus.hasRemote) {
            const freshTasks = projectStoreApi.getState().tasks;
            const completed = freshTasks.filter((t) => t.completed);
            const prTitle = completed.length === 1
              ? completed[0].title
              : `Fix ${completed.length} issues`;

            await window.api.github.gitPush(currentProject.projectPath);
            queueAssistantMessage(currentProject.slug, `Pushed changes to remote. Create a PR from the GitHub UI or CLI.`);
          }
        } catch (err) {
          console.error('[BuildPipeline] Auto-push failed (non-fatal):', err);
        }
      }

      if (!isMountedRef.current) return;
      goToPreview();
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error('Failed to update project status:', err);
      setError(classifyError('Failed to proceed to preview. Please try again.'));
    }
  }, [updateProject, goToPreview, goToPlanning, isMountedRef, oneOffBacklogItemId, setOneOffBacklogItemId, loadTasks, cleanupAndRestoreMain, updateBacklogItem]);

  const handleEndBuild = useCallback(async () => {
    // One-off mode: mark backlog item, restore original tasks, go back to planning
    if (oneOffBacklogItemId) {
      const confirmed = window.confirm('End one-off task and return to planning?');
      if (!confirmed) return;
      await cleanupAndRestoreMain();
      updateBacklogItem(oneOffBacklogItemId, {
        notes: `One-off ended early on ${new Date().toLocaleDateString()}`,
      });
      setOneOffBacklogItemId(null);
      await loadTasks();
      goToPlanning();
      return;
    }

    const confirmed = window.confirm(
      completedTasks < tasks.length
        ? `You have ${tasks.length - completedTasks} tasks remaining. End build and preview your app?`
        : 'End build session and preview your app?'
    );
    if (!confirmed) return;

    await cleanupAndRestoreMain();
    handleBuildComplete();
  }, [completedTasks, tasks.length, cleanupAndRestoreMain, handleBuildComplete, oneOffBacklogItemId, setOneOffBacklogItemId, loadTasks, goToPlanning, updateBacklogItem]);

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

    // One-off mode: mark backlog item and restore original tasks
    if (oneOffBacklogItemId) {
      updateBacklogItem(oneOffBacklogItemId, {
        notes: `One-off cancelled on ${new Date().toLocaleDateString()}`,
      });
      setOneOffBacklogItemId(null);
      await loadTasks();
    }

    goToPlanning();
  }, [sessionActive, taskPhase, completedTasks, tasks.length, cleanupAndRestoreMain, goToPlanning, oneOffBacklogItemId, setOneOffBacklogItemId, loadTasks, updateBacklogItem]);

  // NOTE: Auto-start removed — BuildScreen calls runAllTasks via preflight.runGuarded
  // NOTE: No PTY session management needed — build uses headless claude.chat() API

  // Resolve a pending decision for a task (called from the UI DecisionPoint component)
  const resolveDecision = useCallback((taskId: string, response: string) => {
    const resolver = decisionResolversRef.current.get(taskId);
    if (resolver) {
      resolver(response);
    }
  }, []);

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
    resolveDecision,
  };
}
