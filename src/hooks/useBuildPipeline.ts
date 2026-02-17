import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useIsMounted } from './useIsMounted';
import type { Task, TaskPhase, ReviewArtifact } from '../types';
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
  } = useAppStore();

  const isMountedRef = useIsMounted();

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

  const pipelineStartedRef = useRef(false);
  const pipelineErrorRef = useRef(false);
  const taskPhaseRef = useRef<TaskPhase>('idle');
  const runIdRef = useRef(0);

  // Pause/resume mechanism
  const pauseRequestedRef = useRef(false);
  const pauseResolverRef = useRef<(() => void) | null>(null);
  const [paused, setPaused] = useState(false);

  // Auto-approve: when false (default), pipeline pauses after every task for user review
  const autoApproveRef = useRef(false);

  // Keep refs in sync
  useEffect(() => {
    taskPhaseRef.current = taskPhase;
  }, [taskPhase]);

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

  // ─── CORE PIPELINE (checkpoint-aware) ───────────────────────
  const runTaskPipeline = useCallback(
    async (task: Task, idx: number, retryFromScratch = false, myRunId?: number) => {
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
          await retryOnTimeout(() => window.api.claude.chat(projectPath, buildPrompt, 10 * 60 * 1000), 2, `build:${task.title}`);
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

            // Stream review output via chatOutput listener
            setReviewOutput('');
            window.api.claude.onChatOutput((content: string) => {
              if (!isMountedRef.current) return;
              setReviewOutput((prev) => prev + content);
            });

            const reviewResponse = await retryOnTimeout(
              () => window.api.claude.chat(projectPath, buildReviewPrompt(task, diff), 10 * 60 * 1000),
              1, `review:${task.title}`
            );

            artifact = parseReviewResponse(reviewResponse, task, branchName, diffStat);
            setReviewArtifact(artifact);
            addGitEvent({ type: 'review_completed', taskId: task.id, taskTitle: task.title, branchName, reviewArtifact: artifact });

            // FIXING (if needed)
            if (hasFixableIssues(artifact)) {
              if (!isMountedRef.current || isStale()) return;
              setTaskPhase('fixing');

              setReviewOutput('');
              await retryOnTimeout(
                () => window.api.claude.chat(projectPath, buildFixPrompt(artifact), 10 * 60 * 1000),
                1, `fix:${task.title}`
              );

              // Mark findings as fixed based on what the reviewer said is auto-fixable
              artifact.findings = artifact.findings.map((f) => {
                if (f.severity === 'warning') return { ...f, fixed: true };
                if (f.severity === 'critical' && artifact.canAutoFix) return { ...f, fixed: true };
                return f;
              });
              artifact.autoFixApplied = true;
              setReviewArtifact({ ...artifact });

              const fixResult = await window.api.github.gitAddAndCommit(
                projectPath,
                `fix: review findings for ${task.title}`
              );
              addGitEvent({ type: 'auto_fixed', taskId: task.id, taskTitle: task.title, branchName, commitHash: fixResult.commitHash, commitMessage: `fix: review findings for ${task.title}` });
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

          updateTask(task.id, { buildPhase: 'reviewed', lastReviewArtifact: artifact });
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
        pipelineErrorRef.current = true;
        setTaskPhase('error');
        const rawMsg = err instanceof Error ? err.message : 'Pipeline failed';
        const classified = classifyError(rawMsg);
        setError(classified);
        notifyHoustonBuildError(task.title, classified.userAction || classified.title);

        // Best-effort recovery to main — but don't destroy feature branch work
        try {
          await window.api.github.resetWorkingTree(projectPath);
          await window.api.github.checkoutBranch(projectPath, 'main');
          setCurrentBranch('main');
        } catch {
          // Best effort recovery
        }
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

  // ─── MAIN PIPELINE LOOP ───────────────────────────────────────
  const runAllTasks = useCallback(async () => {
    if (!currentProject || pipelineStartedRef.current) return;
    pipelineStartedRef.current = true;
    pipelineErrorRef.current = false;

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

    let completedCount = 0;

    for (let i = 0; i < tasks.length; i++) {
      if (!isMountedRef.current || pipelineErrorRef.current || isStale()) break;
      const task = tasks[i];
      if (task.completed) continue;

      setCurrentTaskId(task.id);
      await runTaskPipeline(task, i, false, myRunId);

      // Stop if an error occurred, component unmounted, or run superseded
      if (!isMountedRef.current || pipelineErrorRef.current || isStale()) break;

      completedCount++;

      // Auto-pause for user approval between tasks (unless auto-approve is on)
      const remainingCount = tasks.filter((t) => !t.completed).length - completedCount;
      if (!autoApproveRef.current && remainingCount > 0) {
        pauseRequestedRef.current = true;
        useAppStore.getState().notifyHoustonTaskApproval(
          task.title,
          completedCount,
          tasks.length,
          remainingCount
        );
      }

      // Mid-operation health check between tasks
      try {
        const healthCheck = await window.api.cli.checkAll();
        if (!healthCheck.claude?.authenticated || !healthCheck.github?.authenticated) {
          setPreflightNeeded(true);
          await new Promise<void>((resolve) => { preflightResolveRef.current = resolve; });
        }
      } catch {
        // Health check failure is non-fatal
      }

      // Check if user requested a pause between tasks
      await checkPause();
    }

    // Drain tasks added during the build (e.g., Design Duel task)
    if (!pipelineErrorRef.current && !isStale() && isMountedRef.current) {
      const freshTasks = useAppStore.getState().tasks;
      const newUncompleted = freshTasks.filter(t => !t.completed);
      for (const task of newUncompleted) {
        if (!isMountedRef.current || pipelineErrorRef.current || isStale()) break;
        setCurrentTaskId(task.id);
        await runTaskPipeline(task, freshTasks.indexOf(task), false, myRunId);
        if (!isMountedRef.current || pipelineErrorRef.current || isStale()) break;
        await checkPause();
      }
    }

    pipelineStartedRef.current = false;

    // All tasks done — check fresh store state
    if (!isMountedRef.current || pipelineErrorRef.current || isStale()) return;
    const finalTasks = useAppStore.getState().tasks;
    if (finalTasks.every(t => t.completed)) {
      handleBuildComplete();
    }
  }, [currentProject, tasks, isMountedRef, ensureGitRepo, runTaskPipeline, handleBuildComplete, setTaskPhase, setCurrentTaskId, checkPause]);


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

  // Set auto-approve mode (skip pausing between tasks)
  const setAutoApprove = useCallback((value: boolean) => {
    autoApproveRef.current = value;
  }, []);

  // Cleanup: stop the loop, kill orphaned processes, preserve branch state for resume
  const cleanupAndRestoreMain = useCallback(async () => {
    setSessionActive(false);
    pipelineErrorRef.current = true; // stop the loop if still running
    pipelineStartedRef.current = false;
    runIdRef.current++; // invalidate any in-flight loop iterations
    // Clear any pending pause and reset auto-approve
    pauseRequestedRef.current = false;
    autoApproveRef.current = false;
    setPaused(false);
    if (pauseResolverRef.current) {
      pauseResolverRef.current();
      pauseResolverRef.current = null;
    }
    // Kill any running claude chat process to prevent orphans
    try {
      await window.api.claude.cancelChat();
    } catch {
      // Best effort
    }
  }, [setSessionActive]);

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

    // Actions
    runAllTasks,
    resumeAfterPreflight,
    togglePause,
    handleRetry,
    handleSkipTask,
    handleEndBuild,
    handleNavigateBack,
    setAutoApprove,
  };
}
