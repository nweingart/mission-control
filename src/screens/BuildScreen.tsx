import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useBuildPipeline } from '../hooks/useBuildPipeline';
import { usePreflightCheck } from '../hooks/usePreflightCheck';
import ProgressBar from '../components/ProgressBar';
import KanbanBoard from '../components/KanbanBoard';
import BuildProgressBadge from '../components/BuildProgressBadge';
import PreflightGateOverlay from '../components/PreflightGateOverlay';
import type { ServiceKey } from '../constants/preflight-requirements';

export default function BuildScreen() {
  const { currentProject, tasks, flowTestMode, goToProjectHome } = useAppStore();



  const requiredServices: ServiceKey[] = ['claude', 'github'];
  const preflight = usePreflightCheck(requiredServices);
  const pipeline = useBuildPipeline();
  const buildStartedRef = useRef(false);

  const {
    taskPhase,
    paused,
    sessionActive,
    currentTaskId,
    error,
    currentTask,
    completedTasks,
    preflightNeeded,
    runAllTasks,
    resumeAfterPreflight,
    togglePause,
    handleRetry,
    handleSkipTask,
    handleEndBuild,
    handleNavigateBack,
  } = pipeline;

  // ─── Smart progress computation ─────────────────────────────
  const inProgressCount = tasks.filter(t => !t.completed && t.buildPhase).length;
  const remainingCount = tasks.length - completedTasks - inProgressCount;
  const hasPartialProgress = completedTasks > 0 || inProgressCount > 0;
  const allDone = completedTasks === tasks.length && tasks.length > 0;

  // Show start/resume modal only if not all done
  const [showStartModal, setShowStartModal] = useState(!allDone);

  // Update modal state if allDone changes (e.g. tasks loaded async)
  useEffect(() => {
    if (allDone) setShowStartModal(false);
  }, [allDone]);

  // Count completed + the currently active task for display
  const activeTasks = completedTasks + (currentTaskId ? 1 : 0);
  const progress = tasks.length > 0 ? (activeTasks / tasks.length) * 100 : 0;

  // In flow test mode, auto-start pipeline (skip modal)
  useEffect(() => {
    if (!flowTestMode || buildStartedRef.current) return;
    if (!currentProject || tasks.length === 0) return;
    buildStartedRef.current = true;
    setShowStartModal(false);
    preflight.runGuarded(() => runAllTasks());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject, tasks.length, flowTestMode]);

  // Start build from modal confirmation
  const handleStartBuild = () => {
    setShowStartModal(false);
    preflight.runGuarded(() => runAllTasks());
  };

  // For mid-operation preflight, use the preflight hook to get fresh failures
  const midOpPreflight = usePreflightCheck(requiredServices);

  // Show overlay for initial preflight or mid-operation preflight
  const showPreflightOverlay = preflight.status === 'blocked' || preflightNeeded;

  // When mid-operation preflight needed, trigger a check
  useEffect(() => {
    if (preflightNeeded) {
      midOpPreflight.retry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preflightNeeded]);

  const handlePreflightRetry = async () => {
    if (preflightNeeded) {
      // Mid-operation: recheck, then resume the pipeline
      try {
        const status = await window.api.cli.checkAll();
        const claudeOk = status.claude?.installed && status.claude?.authenticated;
        const githubOk = status.github?.installed && status.github?.authenticated;
        if (claudeOk && githubOk) {
          resumeAfterPreflight();
        }
      } catch {
        // Let user try again
      }
    } else {
      // Initial: retry the preflight check
      preflight.retry();
    }
  };

  // ─── Progress bar label ─────────────────────────────────────
  const progressLabel = currentTask
    ? `${completedTasks} done, working on "${currentTask.title}"`
    : allDone
    ? `All ${tasks.length} tasks complete`
    : `Building: task ${activeTasks} of ${tasks.length}`;

  return (
    <div className="flex-1 overflow-hidden flex flex-col relative">
      {showPreflightOverlay && (
        <PreflightGateOverlay
          failures={preflightNeeded ? midOpPreflight.failures : preflight.failures}
          onRetry={handlePreflightRetry}
          context="continue building"
        />
      )}
      {/* Build Header */}
      <div className="bg-surface-card border-b border-border px-6 py-3 flex items-center">
        <BuildProgressBadge
          tasks={tasks}
          currentTaskId={currentTaskId}
          taskPhase={taskPhase}
        />
      </div>

      {/* Content — both tabs always mounted, visibility toggled via CSS */}
      <main className="flex-1 overflow-hidden flex flex-col relative">
        {/* Build Content */}
        <div className="flex-1 overflow-hidden flex flex-col p-6">
            {/* Progress section */}
            <div className="mb-6">
              <ProgressBar
                progress={progress}
                label={progressLabel}
              />
            </div>

            {/* Current task with status badge */}
            <div className="mb-4 bg-surface border border-border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-ink-muted">Current Task:</span>
                  <h3 className="font-medium text-ink">
                    {currentTask?.title || 'All tasks complete!'}
                  </h3>
                </div>
                <div className="flex items-center space-x-3">
                  {sessionActive && (
                    <span className="flex items-center text-spectrum-green text-sm">
                      <span className="relative flex h-2 w-2 mr-2">
                        <span className="animate-ping absolute inline-flex h-full w-full bg-spectrum-green opacity-75"></span>
                        <span className="relative inline-flex h-2 w-2 bg-spectrum-green"></span>
                      </span>
                      Active
                    </span>
                  )}
                  {currentTask && (
                    <span className="px-3 py-1 text-xs font-medium bg-spectrum-green/10 text-spectrum-green">
                      {paused ? 'Paused'
                        : taskPhase === 'building' ? 'Building...'
                        : taskPhase === 'reviewing' ? 'Reviewing...'
                        : taskPhase === 'fixing' ? 'Fixing...'
                        : taskPhase === 'merging' ? 'Merging...'
                        : taskPhase === 'branching' ? 'Branching...'
                        : taskPhase === 'committing' ? 'Committing...'
                        : taskPhase === 'pushing' ? 'Pushing...'
                        : taskPhase === 'error' ? 'Error'
                        : taskPhase}
                    </span>
                  )}
                </div>
              </div>

            </div>

            {/* Three-tier error display */}
            {error && error.severity === 'auto_recoverable' && (
              <div className="mb-4 bg-spectrum-orange/10 border border-spectrum-orange/30 px-4 py-3">
                <div className="flex items-center">
                  <svg className="w-4 h-4 text-spectrum-orange mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-spectrum-orange">Auto-recovering: {error.title}</span>
                  <div className="ml-auto flex gap-2">
                    {error.canRetry && (
                      <button
                        onClick={handleRetry}
                        className="btn-solid px-3 py-1 text-xs"
                      >
                        Retry Now
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {error && error.severity === 'needs_user_action' && (
              <div className="mb-4 bg-spectrum-orange/10 border border-spectrum-orange/30 p-4">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-spectrum-orange mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-spectrum-orange">{error.title}</h3>
                    {error.userAction && (
                      <p className="text-sm text-spectrum-orange/80 mt-1">{error.userAction}</p>
                    )}
                    {error.command && (
                      <div className="mt-2 bg-surface border border-border px-3 py-2 font-mono text-sm text-ink flex items-center justify-between">
                        <code>{error.command}</code>
                        <button
                          onClick={() => navigator.clipboard.writeText(error.command!)}
                          className="ml-3 text-ink-muted hover:text-ink transition-colors flex-shrink-0"
                          title="Copy command"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0 ml-4">
                    {error.canSkipTask && currentTask && (
                      <button
                        onClick={handleSkipTask}
                        className="btn-solid px-3 py-1.5 text-sm text-spectrum-orange"
                      >
                        Skip Task
                      </button>
                    )}
                    {error.canRetry && (
                      <button
                        onClick={handleRetry}
                        className="btn-solid px-3 py-1.5 text-sm"
                      >
                        I Fixed It — Continue
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {error && error.severity === 'catastrophic' && (
              <div className="mb-4 bg-error/10 border border-error/30 p-4">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-error mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-error">{error.title}</h3>
                    <p className="text-sm text-error/80 mt-1">{error.message}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0 ml-4">
                    {error.canSkipTask && currentTask && (
                      <button
                        onClick={handleSkipTask}
                        className="btn-solid px-3 py-1.5 text-sm"
                      >
                        Skip Task
                      </button>
                    )}
                    {error.canRetry && (
                      <button
                        onClick={handleRetry}
                        className="btn-solid px-3 py-1.5 text-sm"
                      >
                        Retry
                      </button>
                    )}
                    <button
                      onClick={handleEndBuild}
                      className="btn-solid-danger px-3 py-1.5 text-sm"
                    >
                      End Build
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Full-width Kanban Board */}
            <div className="flex-1 min-h-0">
              <KanbanBoard
                tasks={tasks}
                currentTaskId={currentTaskId}
                taskPhase={taskPhase}
              />
            </div>

            {/* Footer status */}
            <div className="mt-4 flex justify-between items-center">
              <div className="text-sm text-ink-muted">
                {paused
                  ? 'Build paused'
                  : taskPhase === 'building'
                  ? 'Claude is working on this task...'
                  : taskPhase === 'reviewing'
                  ? 'Reviewing code changes...'
                  : taskPhase === 'fixing'
                  ? 'Auto-fixing review findings...'
                  : taskPhase === 'error'
                  ? 'Pipeline encountered an error.'
                  : `${taskPhase}...`}
              </div>

              <div className="flex items-center gap-3">
                {/* Pause / Resume button — only show when pipeline is actively running */}
                {sessionActive || (taskPhase !== 'idle' && taskPhase !== 'error' && taskPhase !== 'complete') ? (
                  <button
                    onClick={togglePause}
                    className={`btn-solid flex items-center space-x-2 px-4 py-2 ${paused ? 'text-spectrum-green' : 'text-ink-muted'}`}
                  >
                    {paused ? (
                      <>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        <span>Resume</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                        </svg>
                        <span>Pause</span>
                      </>
                    )}
                  </button>
                ) : null}

                {allDone && (
                  <button
                    onClick={handleEndBuild}
                    className="btn-solid-primary flex items-center space-x-2 px-6 py-2"
                  >
                    <span>Build Complete — See Preview</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
        </div>

      </main>

      {/* Start / Resume Build Modal */}
      {showStartModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="card-panel p-8 max-w-md w-full mx-4 text-center">
            <div className="w-14 h-14 bg-spectrum-green/10 flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-spectrum-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            {hasPartialProgress ? (
              <>
                <h2 className="text-base font-sans font-semibold text-ink mb-2">Resume building?</h2>
                <p className="text-ink-muted text-sm mb-6">
                  {completedTasks} done{inProgressCount > 0 ? `, ${inProgressCount} in progress` : ''}, {remainingCount} remaining
                </p>
                <button
                  onClick={handleStartBuild}
                  className="btn-solid-primary px-8 py-3 font-medium text-base"
                >
                  Resume Building
                </button>
              </>
            ) : (
              <>
                <h2 className="text-base font-sans font-semibold text-ink mb-2">Ready to execute tasks?</h2>
                <p className="text-ink-muted text-sm mb-6">
                  {tasks.length} task{tasks.length !== 1 ? 's' : ''} to build
                </p>
                <button
                  onClick={handleStartBuild}
                  className="btn-solid-primary px-8 py-3 font-medium text-base"
                >
                  Start Building
                </button>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
