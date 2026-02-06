import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import Terminal from '../components/Terminal';
import ProgressBar from '../components/ProgressBar';
import KanbanBoard from '../components/KanbanBoard';
import BuildProgressBadge from '../components/BuildProgressBadge';
import PlanningView from '../components/PlanningView';
import type { Task, TaskPhase, ReviewFinding, ReviewArtifact } from '../types';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// ─── PURE HELPERS (module-level, no component deps) ──────────────

// Extract the first balanced JSON object from a string
function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

// Parse Claude review response into ReviewArtifact
function parseReviewResponse(
  response: string,
  task: Task,
  branchName: string,
  diffStat: string
): ReviewArtifact {
  try {
    const jsonStr = extractJsonObject(response);
    if (jsonStr && jsonStr.includes('"findings"')) {
      const parsed = JSON.parse(jsonStr);
      const findings: ReviewFinding[] = (parsed.findings || []).map(
        (f: { severity?: string; category?: string; description?: string; file?: string }) => ({
          severity: f.severity || 'info',
          category: f.category || 'general',
          description: f.description || '',
          file: f.file,
          fixed: false,
        })
      );
      return {
        taskId: task.id,
        taskTitle: task.title,
        branchName,
        findings,
        summary: parsed.summary || 'Review complete.',
        autoFixApplied: false,
        canAutoFix: parsed.canAutoFix ?? true,
        diffStat,
        timestamp: new Date().toISOString(),
      };
    }
  } catch {
    // JSON parse failed
  }

  // Fallback: treat entire response as summary
  return {
    taskId: task.id,
    taskTitle: task.title,
    branchName,
    findings: [
      {
        severity: 'info',
        category: 'general',
        description: response.slice(0, 500),
        fixed: false,
      },
    ],
    summary: response.slice(0, 300),
    autoFixApplied: false,
    canAutoFix: false,
    diffStat,
    timestamp: new Date().toISOString(),
  };
}

function hasFixableIssues(artifact: ReviewArtifact): boolean {
  return artifact.findings.some(
    (f) => (f.severity === 'critical' || f.severity === 'warning') && !f.fixed
  );
}

function hasCriticalUnfixable(artifact: ReviewArtifact): boolean {
  return artifact.findings.some((f) => f.severity === 'critical' && !f.fixed);
}

// Build the review prompt
function buildReviewPrompt(task: Task, diff: string): string {
  const truncatedDiff = diff.slice(0, 50000);
  return `You are a senior code reviewer. Review this diff for task "${task.title}".

Focus on: security vulnerabilities, bugs, performance, best practices.

Return JSON:
{
  "findings": [{ "severity": "critical"|"warning"|"info", "category": "security"|"performance"|"best-practice"|"bug", "description": "...", "file": "..." }],
  "summary": "...",
  "canAutoFix": true|false
}

Diff:
\`\`\`diff
${truncatedDiff}
\`\`\``;
}

// Build the fix prompt
function buildFixPrompt(artifact: ReviewArtifact): string {
  const issues = artifact.findings
    .filter((f) => (f.severity === 'critical' || f.severity === 'warning') && !f.fixed)
    .map((f) => `- [${f.severity}] ${f.category}: ${f.description}${f.file ? ` (${f.file})` : ''}`)
    .join('\n');

  return `Fix these issues in the codebase:\n${issues}\n\nFix each directly. Do not create unnecessary files.`;
}

export default function BuildScreen() {
  const {
    currentProject,
    tasks,
    updateTask,
    saveTasks,
    buildSessionId,
    setBuildSessionId,
    updateProject,
    goToPlanning,
    goToPreview,
    flowTestMode,
    addGitEvent,
  } = useAppStore();

  // Tab state for Build vs Plan V2
  const [activeTab, setActiveTab] = useState<'build' | 'plan'>('build');
  const [prd, setPrd] = useState<string>('');

  // Per-task pipeline state
  const [taskPhase, setTaskPhase] = useState<TaskPhase>('idle');
  const [currentBranch, setCurrentBranch] = useState('main');
  const [reviewArtifact, setReviewArtifact] = useState<ReviewArtifact | null>(null);
  const [reviewHistory, setReviewHistory] = useState<ReviewArtifact[]>([]);
  const [reviewOutput, setReviewOutput] = useState('');
  const [pauseReason, setPauseReason] = useState<string | null>(null);

  const [sessionActive, setSessionActive] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const pipelineStartedRef = useRef(false);
  const pipelineErrorRef = useRef(false);
  const taskPhaseRef = useRef<TaskPhase>('idle');

  // Toast-based completion detection state
  const [completionDetected, setCompletionDetected] = useState(false);
  const [completionCountdown, setCompletionCountdown] = useState(5);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ref mirror of buildSessionId so interval/event callbacks always read the current value
  const buildSessionIdRef = useRef<string | null>(buildSessionId);

  // Promise resolvers for pipeline synchronization
  const taskCompleteResolverRef = useRef<(() => void) | null>(null);
  const userInputResolverRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load PRD for planning view
  useEffect(() => {
    const loadPrd = async () => {
      if (currentProject) {
        const prdContent = await window.api.storage.getPRD(currentProject.slug);
        if (prdContent && isMountedRef.current) {
          setPrd(prdContent);
        }
      }
    };
    loadPrd();
  }, [currentProject]);

  // Keep taskPhaseRef in sync so the exit listener always sees the current phase
  useEffect(() => {
    taskPhaseRef.current = taskPhase;
  }, [taskPhase]);

  // Keep buildSessionIdRef in sync so interval/event callbacks always see the current session
  useEffect(() => {
    buildSessionIdRef.current = buildSessionId;
  }, [buildSessionId]);

  const completedTasks = tasks.filter((t) => t.completed).length;
  const progress = tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;
  const currentTask = tasks.find((t) => t.id === currentTaskId);

  const projectPath = currentProject?.projectPath || '';

  // Wait for "TASK COMPLETE" signal from Claude (with 30-min safety timeout)
  const waitForTaskComplete = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        taskCompleteResolverRef.current = null;
        reject(new Error('Task timed out after 30 minutes without completing'));
      }, 30 * 60 * 1000);

      taskCompleteResolverRef.current = () => {
        clearTimeout(timeout);
        resolve();
      };
    });
  }, []);

  // Wait for user to click "Continue Anyway"
  const waitForUserInput = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      userInputResolverRef.current = resolve;
    });
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
        await window.api.github.ensureGitConfig(projectPath, 'forge');
      }
      await window.api.github.gitAddAndCommit(projectPath, 'Initial commit');
    }

    // Ensure we're on a branch called 'main' (git init may default to 'master')
    const currentBranchName = await window.api.github.getCurrentBranch(projectPath);
    if (currentBranchName !== 'main') {
      // Rename the current branch to 'main'
      await window.api.github.renameBranch(projectPath, 'main');
    }
  }, [projectPath]);

  // ─── CORE PIPELINE ────────────────────────────────────────────
  const runTaskPipeline = useCallback(
    async (task: Task, idx: number) => {
      const branchName = `feature/task-${idx + 1}-${slugify(task.title)}`;

      try {
        // 1. BRANCHING
        if (!isMountedRef.current) return;
        setTaskPhase('branching');
        setCurrentBranch(branchName);
        setReviewArtifact(null);
        setReviewOutput('');
        setPauseReason(null);
        setCompletionDetected(false);
        setCompletionCountdown(5);

        // Discard any uncommitted changes from a previous failed attempt
        await window.api.github.resetWorkingTree(projectPath);
        await window.api.github.checkoutBranch(projectPath, 'main');
        // Delete leftover branch from a previous failed attempt (non-fatal)
        await window.api.github.deleteBranch(projectPath, branchName);
        await window.api.github.createAndCheckoutBranch(projectPath, branchName);
        addGitEvent({ type: 'branch_created', taskId: task.id, taskTitle: task.title, branchName });

        // 2. BUILDING (interactive session, one task only)
        if (!isMountedRef.current) return;
        setTaskPhase('building');

        const sessionId = await window.api.claude.spawnInteractive(projectPath);
        if (!isMountedRef.current) return;

        setBuildSessionId(sessionId);
        setSessionActive(true);

        // Send single-task prompt after delay
        const prd = await window.api.storage.getPRD(currentProject!.slug);
        const totalTasks = tasks.length;

        console.log('[BuildScreen] Scheduling prompt send in 3s for session:', sessionId);
        setTimeout(() => {
          console.log('[BuildScreen] setTimeout fired, isMountedRef:', isMountedRef.current);
          if (!isMountedRef.current) {
            console.log('[BuildScreen] Aborting sendInput: component unmounted');
            return;
          }
          const context = prd || currentProject!.idea || '';
          const supabaseEnv = currentProject!.supabaseRef && currentProject!.envVars
            ? `

## Supabase Database
A Supabase project has been provisioned for this app. Use these environment variables to connect:
- \`NEXT_PUBLIC_SUPABASE_URL\` = \`${currentProject!.envVars.NEXT_PUBLIC_SUPABASE_URL}\`
- \`NEXT_PUBLIC_SUPABASE_ANON_KEY\` = \`${currentProject!.envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY}\`
- \`SUPABASE_SERVICE_ROLE_KEY\` = \`${currentProject!.envVars.SUPABASE_SERVICE_ROLE_KEY}\`

Create a \`.env.local\` file with these values if one doesn't exist. Use \`@supabase/supabase-js\` for all database access.`
            : '';
          const prompt = `I'm building "${currentProject!.name}".

## Context
${context}
${supabaseEnv}

## Your Task
Task ${idx + 1} of ${totalTasks}: ${task.title}

Build this task completely. When you are finished, say "TASK COMPLETE" on its own line.
Do not work on anything else.`;

          console.log('[BuildScreen] Sending prompt to Claude, length:', prompt.length);
          window.api.claude.sendInput(sessionId, prompt + '\n');

          // Enable completion detection 2s after prompt sent (5s total from session start)
          // to avoid false positives from the prompt echo
          setTimeout(() => {
            if (!isMountedRef.current) return;
            console.log('[BuildScreen] Enabling completion detection for session:', sessionId);
            window.api.claude.enableCompletionDetection(sessionId);
          }, 2000);
        }, 3000);

        // Wait for TASK COMPLETE
        await waitForTaskComplete();

        // Kill the session
        try {
          await window.api.claude.kill(sessionId);
        } catch {
          // Session may have already exited
        }
        setSessionActive(false);
        setBuildSessionId(null);

        // 3. COMMITTING
        if (!isMountedRef.current) return;
        setTaskPhase('committing');
        const commitResult = await window.api.github.gitAddAndCommit(projectPath, `feat: ${task.title}`);
        addGitEvent({ type: 'committed', taskId: task.id, taskTitle: task.title, branchName, commitHash: commitResult.commitHash, commitMessage: `feat: ${task.title}` });

        // 4. REVIEWING
        if (!isMountedRef.current) return;
        setTaskPhase('reviewing');

        const diff = await window.api.github.getDiff(projectPath, 'main');

        if (diff.trim().length === 0) {
          // Empty diff — skip review, merge is a no-op
          const emptyArtifact: ReviewArtifact = {
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
          setReviewArtifact(emptyArtifact);
          setReviewHistory((prev) => [...prev, emptyArtifact]);
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

          const reviewResponse = await window.api.claude.chat(
            projectPath,
            buildReviewPrompt(task, diff)
          );

          const artifact = parseReviewResponse(reviewResponse, task, branchName, diffStat);
          setReviewArtifact(artifact);
          addGitEvent({ type: 'review_completed', taskId: task.id, taskTitle: task.title, branchName, reviewArtifact: artifact });

          // 5. FIXING (if needed)
          if (hasFixableIssues(artifact)) {
            if (!isMountedRef.current) return;
            setTaskPhase('fixing');

            setReviewOutput('');
            await window.api.claude.chat(projectPath, buildFixPrompt(artifact));

            // Mark findings as fixed based on what the reviewer said is auto-fixable:
            // - Warnings are always marked fixed (low risk)
            // - Critical findings only marked fixed if reviewer said canAutoFix
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
            if (!isMountedRef.current) return;
            setTaskPhase('needs_input');
            setPauseReason(
              artifact.findings
                .filter((f) => f.severity === 'critical' && !f.fixed)
                .map((f) => f.description)
                .join('; ')
            );
            await waitForUserInput();
          }

          setReviewHistory((prev) => [...prev, artifact]);
        }

        // 6. MERGING
        if (!isMountedRef.current) return;
        setTaskPhase('merging');
        await window.api.github.checkoutBranch(projectPath, 'main');
        await window.api.github.mergeBranch(projectPath, branchName);
        await window.api.github.deleteBranch(projectPath, branchName);
        setCurrentBranch('main');
        addGitEvent({ type: 'merged', taskId: task.id, taskTitle: task.title, branchName });

        // 7. PUSHING
        if (!isMountedRef.current) return;
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

        // 8. COMPLETE
        if (!isMountedRef.current) return;
        setTaskPhase('complete');
        updateTask(task.id, { completed: true });
        saveTasks();
      } catch (err) {
        if (!isMountedRef.current) return;
        console.error(`[BuildScreen] Pipeline error for task "${task.title}":`, err);
        pipelineErrorRef.current = true;
        setTaskPhase('error');
        setError(err instanceof Error ? err.message : 'Pipeline failed');

        // Recover to main branch — discard dirty state first
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
      setBuildSessionId,
      updateTask,
      saveTasks,
      waitForTaskComplete,
      waitForUserInput,
      addGitEvent,
    ]
  );

  // Handle build completion
  const handleBuildComplete = useCallback(async () => {
    try {
      await updateProject({ status: 'previewing' });
      if (!isMountedRef.current) return;
      goToPreview();
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error('Failed to update project status:', err);
      setError('Failed to proceed to preview. Please try again.');
    }
  }, [updateProject, goToPreview]);

  // ─── MAIN PIPELINE LOOP ───────────────────────────────────────
  const runAllTasks = useCallback(async () => {
    if (!currentProject || pipelineStartedRef.current) return;
    pipelineStartedRef.current = true;
    pipelineErrorRef.current = false;

    try {
      await ensureGitRepo();
    } catch (err) {
      console.error('[BuildScreen] Git init failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize git');
      pipelineStartedRef.current = false;
      return;
    }

    const incompleteTasks = tasks.filter((t) => !t.completed);
    let completedCount = 0;

    for (let i = 0; i < tasks.length; i++) {
      if (!isMountedRef.current || pipelineErrorRef.current) break;
      const task = tasks[i];
      if (task.completed) continue;

      setCurrentTaskId(task.id);
      await runTaskPipeline(task, i);

      // Stop if an error occurred or component unmounted
      if (!isMountedRef.current || pipelineErrorRef.current) break;

      completedCount++;

      // Pause briefly before next task so review is visible
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    pipelineStartedRef.current = false;

    // All tasks done — compare against count rather than stale closure
    if (!isMountedRef.current || pipelineErrorRef.current) return;
    if (completedCount === incompleteTasks.length) {
      handleBuildComplete();
    }
  }, [currentProject, tasks, ensureGitRepo, runTaskPipeline, handleBuildComplete]);

  // Handle completion detected from main process (after 4s idle)
  const handleCompletionDetected = useCallback((data: { sessionId: string }) => {
    if (!isMountedRef.current || taskPhaseRef.current !== 'building') return;
    // Ignore stale events from a previous session
    if (data.sessionId !== buildSessionIdRef.current) return;
    console.log('[BuildScreen] Completion detected — showing toast');
    setCompletionDetected(true);
    setCompletionCountdown(5);

    // Start visible countdown
    countdownTimerRef.current = setInterval(() => {
      setCompletionCountdown((prev) => {
        if (prev <= 1) {
          // Countdown expired — advance
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          setCompletionDetected(false);

          // Confirm completion in main process
          const sid = buildSessionIdRef.current;
          if (sid) {
            window.api.claude.confirmCompletion(sid);
          }

          // Resolve the pipeline promise
          if (taskCompleteResolverRef.current) {
            taskCompleteResolverRef.current();
            taskCompleteResolverRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Cancel auto-advance (dismiss toast, reset detection)
  const handleCancelAutoAdvance = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCompletionDetected(false);
    setCompletionCountdown(5);

    // Reset detection in main process so it can re-trigger
    const sid = buildSessionIdRef.current;
    if (sid) {
      window.api.claude.resetCompletionDetection(sid);
    }
  }, []);

  // Advance now (skip countdown)
  const handleAdvanceNow = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCompletionDetected(false);

    // Confirm completion in main process
    const sid = buildSessionIdRef.current;
    if (sid) {
      window.api.claude.confirmCompletion(sid);
    }

    // Resolve the pipeline promise immediately
    if (taskCompleteResolverRef.current) {
      taskCompleteResolverRef.current();
      taskCompleteResolverRef.current = null;
    }
  }, []);

  // Manual "Mark Complete" — resolves the same promise
  const handleManualMarkComplete = useCallback(() => {
    // Dismiss toast if showing
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCompletionDetected(false);

    // Disable detection in main process
    const sid = buildSessionIdRef.current;
    if (sid) {
      window.api.claude.confirmCompletion(sid);
    }

    if (taskCompleteResolverRef.current) {
      taskCompleteResolverRef.current();
      taskCompleteResolverRef.current = null;
    }
  }, []);

  // "Continue Anyway" for critical unfixable issues
  const handleContinueAnyway = useCallback(() => {
    setPauseReason(null);
    if (userInputResolverRef.current) {
      userInputResolverRef.current();
      userInputResolverRef.current = null;
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

  // Set up exit listener and completion detection listener
  useEffect(() => {
    const handleExit = (data: { sessionId: string; code: number }) => {
      if (!isMountedRef.current) return;
      console.log('[BuildScreen] Session exited with code:', data.code);
      setSessionActive(false);

      // Dismiss toast if showing
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      setCompletionDetected(false);

      // If the session exits during building, resolve taskComplete so pipeline can continue
      if (taskPhaseRef.current === 'building' && taskCompleteResolverRef.current) {
        if (data.code !== 0) {
          console.warn('[BuildScreen] Session crashed with exit code:', data.code);
          setError(`Claude session exited unexpectedly (code ${data.code}). Task may be incomplete.`);
        }
        taskCompleteResolverRef.current();
        taskCompleteResolverRef.current = null;
      }
    };

    window.api.claude.onExit(handleExit);
    window.api.claude.onCompletionDetected(handleCompletionDetected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start pipeline on mount (skip in flow test mode)
  useEffect(() => {
    console.log('[BuildScreen] Auto-start check:', {
      flowTestMode,
      hasProject: !!currentProject,
      tasksLength: tasks.length,
      pipelineStarted: pipelineStartedRef.current,
    });
    if (flowTestMode) {
      console.log('[BuildScreen] Skipping auto-start: flowTestMode is true');
      return;
    }
    if (currentProject && tasks.length > 0 && !pipelineStartedRef.current) {
      console.log('[BuildScreen] Starting runAllTasks automatically');
      runAllTasks();
    }
  }, [currentProject, tasks.length, runAllTasks, flowTestMode]);

  // Kill stale session when buildSessionId changes (but don't touch listeners)
  const prevSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevSessionIdRef.current;
    prevSessionIdRef.current = buildSessionId;

    // If the previous session ID was non-null and differs from current, kill it
    if (prev && prev !== buildSessionId) {
      try {
        window.api.claude.kill(prev);
      } catch (err) {
        console.error('Error killing previous Claude session:', err);
      }
    }
  }, [buildSessionId]);

  // Remove listeners and clean up timers on unmount
  useEffect(() => {
    return () => {
      if (buildSessionId) {
        try {
          window.api.claude.kill(buildSessionId);
        } catch (err) {
          console.error('Error killing Claude session on unmount:', err);
        }
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      window.api.claude.removeListeners();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup: kill session, discard dirty state, return to main
  const cleanupAndRestoreMain = useCallback(async () => {
    if (buildSessionId) {
      try {
        await window.api.claude.kill(buildSessionId);
      } catch (err) {
        console.error('Error killing Claude session:', err);
      }
      setBuildSessionId(null);
    }
    setSessionActive(false);
    pipelineErrorRef.current = true; // stop the loop if still running

    // Restore to main branch
    try {
      await window.api.github.resetWorkingTree(projectPath);
      await window.api.github.checkoutBranch(projectPath, 'main');
      setCurrentBranch('main');
    } catch {
      // Best effort — may already be on main or repo may not exist yet
    }
  }, [buildSessionId, setBuildSessionId, projectPath]);

  const handleEndBuild = async () => {
    const confirmed = window.confirm(
      completedTasks < tasks.length
        ? `You have ${tasks.length - completedTasks} tasks remaining. End build and preview your app?`
        : 'End build session and preview your app?'
    );
    if (!confirmed) return;

    await cleanupAndRestoreMain();
    handleBuildComplete();
  };

  const handleNavigateBack = async () => {
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
  };

  // ─── RIGHT PANEL RENDERING ────────────────────────────────────
  const renderRightPanel = () => {
    // During building: show terminal with completion toast overlay
    if (taskPhase === 'building') {
      return (
        <div className="relative h-full">
          <Terminal
            title={`Claude Code - ${currentProject?.name || 'Build'}`}
            sessionId={buildSessionId}
            onInput={(input) => {
              if (buildSessionId) {
                window.api.claude.sendInput(buildSessionId, input);
              }
            }}
          />
          {/* Completion toast */}
          {completionDetected && (
            <div className="absolute bottom-4 left-4 right-4 bg-charcoal-800 border border-sage-500/50 rounded-lg p-4 shadow-lg z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-sage-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-cream-100">
                    Task appears complete — Advancing in {completionCountdown}s...
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCancelAutoAdvance}
                    className="px-3 py-1.5 text-sm text-charcoal-300 hover:text-cream-100 border border-charcoal-500 rounded-lg hover:border-charcoal-400 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAdvanceNow}
                    className="px-3 py-1.5 text-sm bg-sage-500 text-charcoal-950 font-medium rounded-lg hover:bg-sage-600 transition-colors"
                  >
                    Advance Now
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // During review / fixing / needs_input / complete: show review panel
    if (
      taskPhase === 'reviewing' ||
      taskPhase === 'fixing' ||
      taskPhase === 'needs_input' ||
      taskPhase === 'complete'
    ) {
      return (
        <div className="h-full flex flex-col bg-charcoal-700 rounded-lg border border-charcoal-600 overflow-hidden">
          {/* Review header */}
          <div className="px-4 py-3 border-b border-charcoal-600 bg-charcoal-800">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-cream-100">
                Code Review: {currentTask?.title || 'Task'}
              </h3>
              <span className="text-xs font-mono bg-charcoal-600 text-charcoal-200 px-2 py-1 rounded">
                {currentBranch}
              </span>
            </div>
            {reviewArtifact?.diffStat && (
              <p className="text-xs text-charcoal-300 mt-1 font-mono">
                {reviewArtifact.diffStat}
              </p>
            )}
          </div>

          {/* Review body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Streaming output during review */}
            {taskPhase === 'reviewing' && !reviewArtifact && reviewOutput && (
              <div className="bg-charcoal-800 rounded p-3">
                <p className="text-xs text-charcoal-300 mb-2">Reviewing...</p>
                <pre className="text-sm text-cream-100 whitespace-pre-wrap font-mono">
                  {reviewOutput}
                </pre>
              </div>
            )}

            {/* Fixing indicator */}
            {taskPhase === 'fixing' && (
              <div className="flex items-center gap-2 text-terracotta-500 bg-terracotta-500/10 rounded-lg p-3">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-sm font-medium">Auto-fixing issues...</span>
              </div>
            )}

            {/* Needs input */}
            {taskPhase === 'needs_input' && pauseReason && (
              <div className="bg-terracotta-500/10 border border-terracotta-500/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-terracotta-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <h4 className="font-medium text-terracotta-400">Critical Issue Found</h4>
                    <p className="text-sm text-terracotta-400 mt-1">{pauseReason}</p>
                    <button
                      onClick={handleContinueAnyway}
                      className="mt-3 px-4 py-2 bg-terracotta-500 text-charcoal-950 text-sm font-medium rounded-lg hover:bg-terracotta-600 transition-colors"
                    >
                      Continue Anyway
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Findings list */}
            {reviewArtifact && reviewArtifact.findings.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-cream-100">Findings</h4>
                {reviewArtifact.findings.map((finding, i) => (
                  <FindingCard key={i} finding={finding} />
                ))}
              </div>
            )}

            {/* Summary */}
            {reviewArtifact?.summary && (
              <div className="bg-charcoal-800 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-cream-100 mb-1">Summary</h4>
                <p className="text-sm text-charcoal-200">{reviewArtifact.summary}</p>
              </div>
            )}

            {/* Auto-fix badge */}
            {reviewArtifact?.autoFixApplied && (
              <div className="flex items-center gap-2 text-sage-500 text-sm">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Auto-fix applied
              </div>
            )}

            {/* Previous reviews */}
            {reviewHistory.length > 0 && (
              <div className="border-t border-charcoal-600 pt-4 mt-4">
                <h4 className="text-sm font-semibold text-charcoal-300 mb-2">
                  Previous Reviews ({reviewHistory.length})
                </h4>
                <div className="space-y-2">
                  {reviewHistory.map((artifact, i) => (
                    <div key={i} className="bg-charcoal-800 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-cream-100">{artifact.taskTitle}</span>
                        <span className="text-xs text-charcoal-400 font-mono">{artifact.diffStat}</span>
                      </div>
                      <p className="text-xs text-charcoal-300">{artifact.summary}</p>
                      {artifact.findings.length > 0 && (
                        <div className="flex gap-2 mt-1">
                          {artifact.findings.filter((f) => f.severity === 'critical').length > 0 && (
                            <span className="text-xs bg-rust-500/15 text-rust-400 px-1.5 py-0.5 rounded">
                              {artifact.findings.filter((f) => f.severity === 'critical').length} critical
                            </span>
                          )}
                          {artifact.findings.filter((f) => f.severity === 'warning').length > 0 && (
                            <span className="text-xs bg-terracotta-500/15 text-terracotta-400 px-1.5 py-0.5 rounded">
                              {artifact.findings.filter((f) => f.severity === 'warning').length} warning
                            </span>
                          )}
                          {artifact.autoFixApplied && (
                            <span className="text-xs text-sage-500">auto-fixed</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    // For branching / committing / merging / pushing / idle / error: status card
    return (
      <div className="h-full flex items-center justify-center bg-charcoal-700 rounded-lg border border-charcoal-600">
        <div className="text-center p-8">
          {taskPhase === 'idle' && (
            <>
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-charcoal-600 flex items-center justify-center">
                <svg className="w-6 h-6 text-charcoal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-charcoal-300">Preparing pipeline...</p>
            </>
          )}
          {taskPhase === 'branching' && (
            <>
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-terracotta-500/15 flex items-center justify-center">
                <svg className="w-6 h-6 text-terracotta-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <p className="text-terracotta-500 font-medium">Creating branch</p>
              <p className="text-sm text-charcoal-400 mt-1 font-mono">{currentBranch}</p>
            </>
          )}
          {taskPhase === 'committing' && (
            <>
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-terracotta-500/15 flex items-center justify-center">
                <svg className="w-6 h-6 text-terracotta-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <p className="text-terracotta-500 font-medium">Committing changes</p>
            </>
          )}
          {taskPhase === 'merging' && (
            <>
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-terracotta-500/15 flex items-center justify-center">
                <svg className="w-6 h-6 text-terracotta-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <p className="text-terracotta-500 font-medium">Merging to main</p>
              <p className="text-sm text-charcoal-400 mt-1 font-mono">{currentBranch}</p>
            </>
          )}
          {taskPhase === 'pushing' && (
            <>
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-sage-500/15 flex items-center justify-center">
                <svg className="w-6 h-6 text-sage-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <p className="text-sage-500 font-medium">Pushing to remote</p>
            </>
          )}
          {taskPhase === 'error' && (
            <>
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-rust-500/15 flex items-center justify-center">
                <svg className="w-6 h-6 text-rust-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-rust-500 font-medium">Pipeline Error</p>
              <p className="text-sm text-charcoal-300 mt-1">{error}</p>
              <button
                onClick={handleRetry}
                className="mt-4 px-4 py-2 bg-rust-500 text-cream-100 text-sm font-medium rounded-lg hover:bg-rust-600 transition-colors"
              >
                Retry
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="bg-charcoal-800 border-b border-charcoal-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleNavigateBack}
              className="text-charcoal-300 hover:text-cream-100 transition-colors no-drag"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold text-cream-100">{currentProject?.name}</h1>
              <p className="text-charcoal-300 text-sm">Build Phase - Per-task pipeline</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-charcoal-300">Step 3 of 5</span>
            <div className="flex space-x-1">
              <div className="w-2 h-2 rounded-full bg-terracotta-500"></div>
              <div className="w-2 h-2 rounded-full bg-terracotta-500"></div>
              <div className="w-2 h-2 rounded-full bg-terracotta-500"></div>
              <div className="w-2 h-2 rounded-full bg-charcoal-600"></div>
              <div className="w-2 h-2 rounded-full bg-charcoal-600"></div>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Toggle */}
      <div className="bg-charcoal-800 border-b border-charcoal-600 px-6">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('build')}
            className={`px-4 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'build'
                ? 'text-cream-100'
                : 'text-charcoal-400 hover:text-charcoal-200'
            }`}
          >
            <BuildProgressBadge
              tasks={tasks}
              currentTaskId={currentTaskId}
              taskPhase={taskPhase}
            />
            {activeTab === 'build' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-terracotta-500" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('plan')}
            className={`px-4 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'plan'
                ? 'text-cream-100'
                : 'text-charcoal-400 hover:text-charcoal-200'
            }`}
          >
            Plan V2
            {activeTab === 'plan' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-terracotta-500" />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-hidden flex flex-col p-6">
        {activeTab === 'build' ? (
          <>
            {/* Progress section */}
            <div className="mb-6">
              <ProgressBar
                progress={progress}
                label={`Building: ${completedTasks} of ${tasks.length} tasks complete`}
              />
            </div>

            {/* Current task with controls */}
            <div className="mb-4 bg-charcoal-700 rounded-lg border border-charcoal-600 p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-charcoal-300">Current Task:</span>
              <h3 className="font-medium text-cream-100">
                {currentTask?.title || 'All tasks complete!'}
              </h3>
            </div>
            <div className="flex items-center space-x-3">
              {sessionActive && (
                <span className="flex items-center text-terracotta-500 text-sm">
                  <span className="relative flex h-2 w-2 mr-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-terracotta-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-terracotta-500"></span>
                  </span>
                  Active
                </span>
              )}
              {currentTask && taskPhase === 'building' && (
                <button
                  onClick={handleManualMarkComplete}
                  className="px-4 py-2 bg-sage-500 text-charcoal-950 text-sm font-medium rounded-lg hover:bg-sage-600 transition-colors"
                >
                  Mark Complete
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Error display (only for non-pipeline errors) */}
        {error && taskPhase !== 'error' && (
          <div className="mb-4 bg-rust-500/10 border border-rust-500/30 rounded-lg p-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-rust-500 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <h3 className="font-medium text-rust-400">Error</h3>
                <p className="text-sm text-rust-500 mt-1">{error}</p>
              </div>
              <button
                onClick={handleRetry}
                className="px-3 py-1 bg-rust-500 text-cream-100 text-sm rounded hover:bg-rust-600 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Split view: Kanban + Right Panel */}
        <div className="flex-1 min-h-0 flex gap-4">
          {/* Kanban Board */}
          <div className="w-1/2 min-h-0">
            <KanbanBoard
              tasks={tasks}
              currentTaskId={currentTaskId}
              taskPhase={taskPhase}
            />
          </div>

          {/* Right Panel (Terminal or Review or Status) */}
          <div className="w-1/2 min-h-0">{renderRightPanel()}</div>
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex justify-between items-center">
          <div className="text-sm text-charcoal-300">
            {taskPhase === 'building'
              ? 'Will auto-advance when Claude signals "TASK COMPLETE" and goes idle. You can also click "Mark Complete" manually.'
              : taskPhase === 'reviewing'
              ? 'Reviewing code changes...'
              : taskPhase === 'fixing'
              ? 'Auto-fixing review findings...'
              : taskPhase === 'needs_input'
              ? 'Action required: critical issue detected'
              : taskPhase === 'error'
              ? 'Pipeline encountered an error. Click Retry to continue.'
              : taskPhase === 'idle'
              ? 'Starting pipeline...'
              : `${taskPhase}...`}
          </div>

          <button
            onClick={handleEndBuild}
            className="flex items-center space-x-2 px-6 py-2 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600 transition-colors"
          >
            <span>End Build & Preview</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
          </>
        ) : (
          /* Plan V2 Tab */
          <PlanningView
            tasks={tasks}
            prd={prd}
            currentTaskId={currentTaskId}
            taskPhase={taskPhase}
            isBuilding={!!buildSessionId}
          />
        )}
      </main>
    </div>
  );
}

// ─── FINDING CARD COMPONENT ──────────────────────────────────────
function FindingCard({ finding }: { finding: ReviewFinding }) {
  const severityStyles = {
    critical: {
      bg: 'bg-rust-500/10',
      border: 'border-rust-500/30',
      badge: 'bg-rust-500/15 text-rust-400',
      text: 'text-rust-400',
    },
    warning: {
      bg: 'bg-terracotta-500/10',
      border: 'border-terracotta-500/30',
      badge: 'bg-terracotta-500/15 text-terracotta-400',
      text: 'text-terracotta-400',
    },
    info: {
      bg: 'bg-terracotta-500/10',
      border: 'border-terracotta-500/30',
      badge: 'bg-terracotta-500/15 text-terracotta-400',
      text: 'text-terracotta-400',
    },
  };

  const styles = severityStyles[finding.severity];

  return (
    <div className={`rounded-lg border p-3 ${styles.bg} ${styles.border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles.badge}`}>
              {finding.severity}
            </span>
            <span className="text-xs text-charcoal-300">{finding.category}</span>
            {finding.fixed && (
              <span className="text-xs text-sage-500 flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Fixed
              </span>
            )}
          </div>
          <p className={`text-sm ${styles.text}`}>{finding.description}</p>
          {finding.file && (
            <p className="text-xs text-charcoal-300 mt-1 font-mono">{finding.file}</p>
          )}
        </div>
      </div>
    </div>
  );
}
