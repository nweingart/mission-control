import { useEffect, useRef, useState, useMemo } from 'react';
import { useProjectStore, useProjectStoreApi } from '../store/ProjectStoreContext';
import { useBuildPipeline } from '../hooks/useBuildPipeline';
import { usePreflightCheck } from '../hooks/usePreflightCheck';
import ProgressBar from '../components/ProgressBar';
import { TaskTree, CostTracker, TerminalOutput, AgentStatusBar, TimelineToolCallList } from 'agent-native';
import type { AgentStatus, ToolCall } from 'agent-native';
import { tasksToTaskNodes, buildMetricsToCostEntries } from '../utils/agent-native-adapters';
import BuildProgressBadge from '../components/BuildProgressBadge';
import PreflightGateOverlay from '../components/PreflightGateOverlay';
import DesignDuel from '../components/DesignDuel';
import DecisionPoint from '../components/DecisionPoint';
import type { ServiceKey } from '../constants/preflight-requirements';
import type { AgentRoleConfig } from '../types';
import { queueAssistantMessage } from '../utils/assistant-chat-state';
import mcAvatar from '../assets/mc-avatar.webp';

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

export default function BuildScreen() {
  const currentProject = useProjectStore(s => s.currentProject);
  const tasks = useProjectStore(s => s.tasks);
  const oneOffBacklogItemId = useProjectStore(s => s.oneOffBacklogItemId);
  const backlog = useProjectStore(s => s.backlog);
  const assistantApproval = useProjectStore(s => s.assistantApproval);
  const clearAssistantApproval = useProjectStore(s => s.clearAssistantApproval);
  const notifyAssistantHumanTasks = useProjectStore(s => s.notifyAssistantHumanTasks);
  const projectStoreApi = useProjectStoreApi();



  // Dynamic preflight: include codex if multi-agent mode uses it.
  // Start with null to signal "not yet loaded" — auto-start gates on this.
  const [requiredServices, setRequiredServices] = useState<ServiceKey[] | null>(null);

  useEffect(() => {
    window.api.storage.getConfig().then((config) => {
      const services: ServiceKey[] = ['github'];
      const roles: AgentRoleConfig = config.agentRoles ?? { builder: 'claude', reviewer: 'claude' };
      if (!config.multiAgentEnabled || roles.builder === 'claude' || roles.reviewer === 'claude') {
        services.push('claude');
      }
      if (config.multiAgentEnabled && (roles.builder === 'codex' || roles.reviewer === 'codex')) {
        services.push('codex');
      }
      setRequiredServices(services);
    });
  }, []);

  const preflight = usePreflightCheck(requiredServices ?? ['claude', 'github']);
  const pipeline = useBuildPipeline();
  const buildStartedRef = useRef(false);
  const humanTasksTriggeredRef = useRef(false);
  const designDuelAutoShownRef = useRef(false);
  const [showDesignDuel, setShowDesignDuel] = useState(false);

  // Elapsed timer for "still working" indicator
  const [buildElapsedSec, setBuildElapsedSec] = useState(0);
  useEffect(() => {
    if (!pipeline.sessionActive) {
      setBuildElapsedSec(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => setBuildElapsedSec(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [pipeline.sessionActive]);

  const {
    taskPhase,
    paused,
    sessionActive,
    currentTaskId,
    error,
    currentTask,
    completedTasks,
    preflightNeeded,
    activeTasksMap,
    // Tier state
    currentTier,
    totalTiers,
    tierTasksComplete,
    tierTasksTotal,
    stopRequested,
    failedTaskIds,
    // Token tracking
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
  } = pipeline;

  // ─── Memoized agent-native data ────────────────────────────
  const taskNodes = useMemo(
    () => tasksToTaskNodes(tasks, activeTasksMap, currentTaskId, taskPhase),
    [tasks, activeTasksMap, currentTaskId, taskPhase],
  );
  const costEntries = useMemo(
    () => buildMetrics ? buildMetricsToCostEntries(buildMetrics) : [],
    [buildMetrics],
  );

  // ─── Smart progress computation ─────────────────────────────
  const allDone = completedTasks === tasks.length && tasks.length > 0;

  // Count completed + currently active tasks for display
  const inFlightCount = activeTasksMap.size || (currentTaskId ? 1 : 0);
  const activeTasks = completedTasks + inFlightCount;
  const progress = tasks.length > 0 ? (activeTasks / tasks.length) * 100 : 0;

  // Auto-start build on mount (replaces the old modal)
  // Gates on requiredServices being loaded from config to avoid racing with defaults.
  useEffect(() => {
    if (buildStartedRef.current) return;
    if (!currentProject || tasks.length === 0) return;
    if (allDone) return;
    if (requiredServices === null) return; // Wait for config to load
    buildStartedRef.current = true;
    preflight.runGuarded(() => runAllTasks());
  }, [currentProject, tasks.length, allDone, requiredServices, preflight, runAllTasks]);

  // Auto-trigger assistant for pending human tasks
  useEffect(() => {
    if (humanTasksTriggeredRef.current) return;
    const pendingHumanTasks = currentProject?.humanTasks?.filter((t) => t.status === 'pending');
    if (pendingHumanTasks && pendingHumanTasks.length > 0) {
      humanTasksTriggeredRef.current = true;
      notifyAssistantHumanTasks(pendingHumanTasks);
    }
  }, [currentProject?.humanTasks, notifyAssistantHumanTasks]);

  // Auto-show Design Duel on mount if no preferences exist
  useEffect(() => {
    if (designDuelAutoShownRef.current) return;
    if (!currentProject?.designPreferences) {
      designDuelAutoShownRef.current = true;
      const timer = setTimeout(() => setShowDesignDuel(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [currentProject?.designPreferences]);

  // Edge case: pipeline finished before Design Duel — re-trigger for new task
  useEffect(() => {
    if (!allDone) return;
    const freshTasks = projectStoreApi.getState().tasks;
    const hasUncompletedDesignTask = freshTasks.some(t => !t.completed && t.id.startsWith('task-design-'));
    if (hasUncompletedDesignTask) {
      handleRetry();
    }
  }, [allDone, tasks, projectStoreApi, handleRetry]);

  // Compute human task progress for badge
  const humanTasks = currentProject?.humanTasks ?? [];
  const completedHumanTasks = humanTasks.filter((t) => t.status === 'completed').length;

  // For mid-operation preflight, use the preflight hook to get fresh failures
  const midOpPreflight = usePreflightCheck(requiredServices);

  // Show overlay for initial preflight or mid-operation preflight
  const showPreflightOverlay = preflight.status === 'blocked' || preflightNeeded;

  // When mid-operation preflight needed, trigger a check
  useEffect(() => {
    if (preflightNeeded) {
      midOpPreflight.retry();
    }
  }, [preflightNeeded, midOpPreflight]);

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

  // ─── Approval gate handlers ─────────────────────────────────
  const handleContinueOne = () => {
    clearAssistantApproval();
    togglePause(); // resume pipeline for one task
    if (currentProject?.slug) {
      queueAssistantMessage(currentProject.slug, 'Continuing to the next tier (via Build screen).');
    }
  };

  const handleAutoContinueAll = () => {
    clearAssistantApproval();
    setAutoApprove(true);
    togglePause(); // resume pipeline — won't pause again
    if (currentProject?.slug) {
      queueAssistantMessage(currentProject.slug, 'Auto-continuing all remaining tiers (via Build screen).');
    }
  };

  // ─── Progress bar label ─────────────────────────────────────
  const tierLabel = totalTiers > 1 ? ` (Tier ${currentTier + 1} of ${totalTiers})` : '';
  const progressLabel = currentTask
    ? `${completedTasks} done, working on "${currentTask.title}"${tierLabel}`
    : allDone
    ? `All ${tasks.length} tasks complete`
    : `Building: task ${activeTasks} of ${tasks.length}${tierLabel}`;

  // Count failed tasks for display
  const failedCount = failedTaskIds.length;

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
          parallelCount={activeTasksMap.size > 1 ? activeTasksMap.size : undefined}
        />
        {humanTasks.length > 0 && (
          <div className={`ml-4 flex items-center gap-1.5 px-3 py-1 text-xs font-medium ${
            completedHumanTasks === humanTasks.length
              ? 'bg-success/10 text-success'
              : 'bg-mc-amber/10 text-mc-amber'
          }`}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Setup: {completedHumanTasks}/{humanTasks.length} done
          </div>
        )}
        {!currentProject?.designPreferences && (
          <button
            onClick={() => setShowDesignDuel(true)}
            className="ml-3 flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
            Design
          </button>
        )}
        {totalTiers > 1 && (
          <div className="ml-4 flex items-center gap-2 text-xs text-ink-muted">
            <div className="flex gap-0.5">
              {Array.from({ length: totalTiers }, (_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i < currentTier ? 'bg-success'
                    : i === currentTier ? 'bg-accent animate-pulse'
                    : 'bg-border'
                  }`}
                />
              ))}
            </div>
            <span>Tier {currentTier + 1}/{totalTiers}</span>
            {tierTasksTotal > 0 && (
              <span className="text-ink-muted/60">
                ({tierTasksComplete}/{tierTasksTotal} in tier)
              </span>
            )}
          </div>
        )}
        {failedCount > 0 && (
          <div className="ml-3 flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-error/10 text-error">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            {failedCount} failed
          </div>
        )}
        {/* Real-time token counter */}
        {(buildTokens.input > 0 || buildTokens.output > 0 || sessionActive) && (
          <div className="ml-auto">
            <AgentStatusBar
              status={(sessionActive ? (paused ? 'waiting' : 'acting') : allDone ? 'complete' : 'idle') as AgentStatus}
              tokenUsage={buildTokens.input > 0 || buildTokens.output > 0 ? { input: buildTokens.input, output: buildTokens.output } : undefined}
              cost={buildCostUsd > 0 ? buildCostUsd : undefined}
              classNames={{
                root: 'flex items-center gap-3 px-3 py-1 text-xs',
              }}
            />
          </div>
        )}
      </div>

      {/* One-off mode banner */}
      {oneOffBacklogItemId && (() => {
        const item = backlog.find(b => b.id === oneOffBacklogItemId);
        return (
          <div className="bg-accent/10 border-b border-accent/20 px-6 py-2 flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-accent font-medium">One-off task</span>
            <span className="text-ink-muted">{item ? `"${item.title}"` : ''} — will return to planning when done</span>
          </div>
        );
      })()}

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

            {/* Post-build summary (shown when all done and metrics available) */}
            {allDone && buildMetrics && buildMetrics.totalTokens.input > 0 && (
              <div className="bg-surface-light rounded-xl border border-border p-4 mb-4">
                <h3 className="font-display uppercase text-xs tracking-widest text-ink-muted mb-3">Build Summary</h3>
                <div className="flex items-center gap-4 text-sm mb-3">
                  <span className="text-ink-secondary">{Math.round(buildMetrics.wallClockMs / 60000)} min</span>
                  <span className="text-success">{buildMetrics.tasksCompleted} completed</span>
                  {buildMetrics.tasksFailed > 0 && <span className="text-error">{buildMetrics.tasksFailed} failed</span>}
                </div>
                <CostTracker
                  entries={costEntries}
                  showTable
                  showSummary
                  groupBy="model"
                  classNames={{
                    root: 'bg-transparent',
                    table: 'text-xs',
                  }}
                />
              </div>
            )}

            {/* Current task with live output */}
            {activeTasksMap.size > 1 ? (
              <div className="mb-4 space-y-2">
                <span className="text-sm text-ink-muted">Building {activeTasksMap.size} tasks in parallel:</span>
                {Array.from(activeTasksMap.values()).map(status => {
                  const taskTitle = tasks.find(t => t.id === status.taskId)?.title || status.taskId;
                  const outputLines = status.output
                    ? status.output.split('\n').filter(Boolean)
                    : [];
                  return (
                    <div key={status.taskId}>
                      {status.pendingDecision && (
                        <DecisionPoint
                          taskId={status.taskId}
                          taskTitle={taskTitle}
                          decision={status.pendingDecision}
                          onResolve={resolveDecision}
                        />
                      )}
                      <TerminalOutput
                        lines={outputLines}
                        isStreaming={status.phase !== 'complete' && status.phase !== 'error' && status.phase !== 'awaiting_decision'}
                        title={`${taskTitle} — ${status.phase === 'awaiting_decision' ? 'Decision needed' : status.phase}`}
                        maxHeight={200}
                        collapsible
                        defaultExpanded={activeTasksMap.size <= 3}
                        classNames={{
                          root: 'border border-border rounded overflow-hidden',
                          header: 'bg-surface-light px-3 py-1.5 text-xs',
                          body: 'text-xs',
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mb-4">
                <div className="bg-surface border border-border p-4 mb-2">
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
                        <span className={`px-3 py-1 text-xs font-medium ${
                          taskPhase === 'awaiting_decision'
                            ? 'bg-amber-500/10 text-amber-400'
                            : taskPhase === 'error'
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-spectrum-green/10 text-spectrum-green'
                        }`}>
                          {paused ? 'Paused'
                            : taskPhase === 'building' ? 'Building...'
                            : taskPhase === 'awaiting_decision' ? 'Decision needed'
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
                {/* Decision point for single active task */}
                {currentTask && taskPhase === 'awaiting_decision' && currentTask.pendingDecision && (
                  <DecisionPoint
                    taskId={currentTask.id}
                    taskTitle={currentTask.title}
                    decision={currentTask.pendingDecision}
                    onResolve={resolveDecision}
                  />
                )}
                {/* Live output + tool calls for single active task */}
                {currentTask && sessionActive && (() => {
                  const activeStatus = activeTasksMap.get(currentTask.id);
                  const outputLines = activeStatus?.output
                    ? activeStatus.output.split('\n').filter(Boolean)
                    : [];
                  const taskToolCalls: ToolCall[] = (activeStatus?.toolCalls || []).map((tc) => ({
                    id: tc.id,
                    name: tc.name,
                    input: tc.input,
                    status: tc.status,
                    startedAt: tc.startedAt,
                  }));
                  return (
                    <>
                      {taskToolCalls.length > 0 && (
                        <div className="mb-2">
                          <TimelineToolCallList
                            toolCalls={taskToolCalls}
                            classNames={{
                              root: 'border border-border rounded overflow-hidden bg-surface-light p-3',
                            }}
                          />
                        </div>
                      )}
                      {outputLines.length > 0 && (
                        <TerminalOutput
                          lines={outputLines}
                          isStreaming={taskPhase === 'building' || taskPhase === 'reviewing' || taskPhase === 'fixing'}
                          title={`${currentTask.title} — ${taskPhase}`}
                          maxHeight={250}
                          collapsible
                          defaultExpanded
                          classNames={{
                            root: 'border border-border rounded overflow-hidden',
                            header: 'bg-surface-light px-3 py-1.5 text-xs',
                            body: 'text-xs',
                          }}
                        />
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* Approval banner — pause between tiers */}
            {paused && assistantApproval && (
              <div className="mb-4 bg-accent/10 border border-accent/30 p-4">
                <div className="flex items-start">
                  <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-accent mr-3 flex-shrink-0">
                    <img src={mcAvatar} alt="Assistant" className="w-full h-full object-cover scale-[1.3] translate-y-[15%]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink">
                      <span className="font-medium">"{assistantApproval.taskTitle}"</span> completed.{' '}
                      {assistantApproval.remaining} {assistantApproval.remaining === 1 ? 'task' : 'tasks'} remaining.
                    </p>
                    <p className="text-xs text-ink-muted mt-1">
                      Review the changes, then continue to the next tier.
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0 ml-4">
                    <button
                      onClick={handleContinueOne}
                      className="btn-solid-primary px-4 py-1.5 text-sm"
                    >
                      Next Tier
                    </button>
                    <button
                      onClick={handleAutoContinueAll}
                      className="btn-solid px-4 py-1.5 text-sm text-ink-muted"
                    >
                      Auto-continue all
                    </button>
                  </div>
                </div>
              </div>
            )}

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

            {/* Task Tree */}
            <div className="flex-1 min-h-0 overflow-auto">
              <TaskTree
                tasks={taskNodes}
                defaultExpandAll
                showElapsedTime
                classNames={{
                  root: 'px-2',
                  label: 'text-sm font-medium',
                  description: 'text-xs text-ink-muted',
                }}
              />
            </div>

            {/* Footer status */}
            <div className="mt-4 flex justify-between items-center">
              <div className="text-sm text-ink-muted flex items-center gap-3">
                <span>
                  {stopRequested
                    ? `Finishing tier ${currentTier + 1}, then stopping...`
                    : paused
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
                </span>
                {sessionActive && buildElapsedSec >= 10 && (
                  <span className="font-mono text-xs text-ink-muted/60">
                    {Math.floor(buildElapsedSec / 60)}:{(buildElapsedSec % 60).toString().padStart(2, '0')}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {/* Pause / Resume button — only show when pipeline is actively running */}
                {sessionActive || (taskPhase !== 'idle' && taskPhase !== 'error' && taskPhase !== 'complete') ? (
                  <>
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
                    {/* Stop after this tier — only show when tiers > 1 and not already stopping */}
                    {totalTiers > 1 && !paused && (
                      <button
                        onClick={requestStopAfterTier}
                        disabled={stopRequested}
                        className={`btn-solid flex items-center space-x-2 px-4 py-2 text-sm ${
                          stopRequested
                            ? 'text-spectrum-orange cursor-default opacity-80'
                            : 'text-ink-muted hover:text-spectrum-orange'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                        </svg>
                        <span>{stopRequested ? 'Stopping after tier...' : 'Stop after tier'}</span>
                      </button>
                    )}
                  </>
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

      {showDesignDuel && (
        <DesignDuel onClose={() => setShowDesignDuel(false)} />
      )}
    </div>
  );
}
