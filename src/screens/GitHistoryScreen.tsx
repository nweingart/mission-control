import { useEffect, useState } from 'react';
import { useProjectStore } from '../store/ProjectStoreContext';
import type { GitEvent, ReviewFinding } from '../types';
import HoustonCallout from '../components/HoustonCallout';
import { parseUnifiedDiff } from '../utils/diff-parser';
import type { DiffFile } from '../utils/diff-parser';
import DiffViewer from '../components/DiffViewer';

// Group events by taskId
function groupByTask(events: GitEvent[]): { taskId: string; taskTitle: string; events: GitEvent[] }[] {
  const groups = new Map<string, { taskId: string; taskTitle: string; events: GitEvent[] }>();

  for (const event of events) {
    const key = event.taskId || '__other__';
    if (!groups.has(key)) {
      groups.set(key, {
        taskId: key,
        taskTitle: event.taskTitle || 'Other',
        events: [],
      });
    }
    groups.get(key)!.events.push(event);
  }

  // Sort groups by most recent event first
  const sorted = Array.from(groups.values()).sort((a, b) => {
    const aLatest = a.events[a.events.length - 1]?.timestamp || '';
    const bLatest = b.events[b.events.length - 1]?.timestamp || '';
    return bLatest.localeCompare(aLatest);
  });

  return sorted;
}

function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;

  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function GitHistoryScreen() {
  const { gitEvents, loadGitEvents } = useProjectStore();

  useEffect(() => {
    loadGitEvents();
  }, [loadGitEvents]);

  const groups = groupByTask(gitEvents);

  // Summary stats
  const totalTasks = groups.filter(g => g.taskId !== '__other__').length;
  const mergedCount = gitEvents.filter(e => e.type === 'merged').length;
  const fixedCount = gitEvents.filter(e => e.type === 'auto_fixed').length;

  const setScreen = useProjectStore((s) => s.setScreen);

  if (gitEvents.length === 0) {
    return (
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <HoustonCallout
            message="No flight records yet."
            ctaLabel="Start Building"
            onCtaClick={() => setScreen('building')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-4">
      <div className="max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xl font-bold text-ink">Git History</h2>
          <p className="text-xs text-ink-muted mt-0.5">{gitEvents.length} events across all branches</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        {groups.map((group) => (
          <TaskGroup key={group.taskId} group={group} />
        ))}

        {/* Summary bar */}
        <div className="card-panel p-4 mt-6">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-ink-muted">Tasks:</span>
              <span className="text-ink font-medium">{totalTasks}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-ink-muted">Branches merged:</span>
              <span className="text-success font-medium">{mergedCount}</span>
            </div>
            {fixedCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-ink-muted">Auto-fixed:</span>
                <span className="text-accent font-medium">{fixedCount}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

// Extract task number from branch name (e.g. "feature/task-2-set-up-..." → 2)
function getTaskNumber(group: { taskId: string; events: GitEvent[] }): number | null {
  const branchName = group.events.find(e => e.branchName)?.branchName;
  if (branchName) {
    const match = branchName.match(/task-(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

// ─── TASK GROUP ──────────────────────────────────────────────────
function TaskGroup({ group }: { group: { taskId: string; taskTitle: string; events: GitEvent[] } }) {
  const [collapsed, setCollapsed] = useState(false);
  const projectPath = useProjectStore(s => s.currentProject?.projectPath);

  // Task-level diff state
  const [taskDiffOpen, setTaskDiffOpen] = useState(false);
  const [taskDiffFiles, setTaskDiffFiles] = useState<DiffFile[]>([]);
  const [taskDiffLoading, setTaskDiffLoading] = useState(false);
  const [taskDiffError, setTaskDiffError] = useState<string | null>(null);

  const branchName = group.events.find(e => e.branchName)?.branchName;
  const isMerged = group.events.some(e => e.type === 'merged');
  const taskNum = getTaskNumber(group);

  // Collect commit hashes from committed + auto_fixed events
  const commitHashes = group.events
    .filter(e => (e.type === 'committed' || e.type === 'auto_fixed') && e.commitHash)
    .map(e => e.commitHash!);

  const handleFilesChanged = async () => {
    if (taskDiffOpen) {
      setTaskDiffOpen(false);
      return;
    }

    if (taskDiffFiles.length > 0) {
      setTaskDiffOpen(true);
      return;
    }

    if (!projectPath || commitHashes.length === 0) return;

    setTaskDiffLoading(true);
    setTaskDiffError(null);
    try {
      const raw = await window.api.github.getTaskDiff(projectPath, commitHashes);
      const files = parseUnifiedDiff(raw);
      setTaskDiffFiles(files);
      setTaskDiffOpen(true);
    } catch (err) {
      setTaskDiffError(err instanceof Error ? err.message : 'Failed to load diff');
      setTaskDiffOpen(true);
    } finally {
      setTaskDiffLoading(false);
    }
  };

  return (
    <div className="card-panel overflow-hidden">
      {/* Task heading */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-2.5 h-2.5 flex-shrink-0 ${isMerged ? 'bg-success' : 'bg-accent'}`} />
            <h3 className="text-base font-sans font-semibold text-ink">
              {taskNum != null ? `Task ${taskNum} — ` : ''}{group.taskTitle}
            </h3>
          </div>
          <div className="flex items-center gap-2.5">
            {commitHashes.length > 0 && (
              <button
                onClick={handleFilesChanged}
                className="text-xs px-2 py-0.5 bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
              >
                {taskDiffOpen ? 'Hide Files Changed' : 'Show Files Changed'}
              </button>
            )}
            {isMerged && (
              <span className="text-xs bg-success/15 text-success px-2 py-0.5">merged</span>
            )}
            {branchName && (
              <span className="text-xs font-mono text-ink-muted hidden sm:inline">
                main {isMerged ? '\u2190' : '\u2194'} {branchName}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Task-level diff */}
      {taskDiffOpen && (
        <>
          <div className="border-t border-border" />
          <div className="px-4 py-3">
            <DiffViewer files={taskDiffFiles} loading={taskDiffLoading} error={taskDiffError} />
          </div>
        </>
      )}

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Collapsible events */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-4 py-2 flex items-center justify-between hover:bg-surface transition-colors text-xs text-ink-muted"
      >
        <span>{group.events.length} event{group.events.length !== 1 ? 's' : ''}</span>
        <svg
          className={`w-3.5 h-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Events */}
      {!collapsed && (
        <div className="border-t border-border/50 px-4 py-2">
          {group.events.map((event, i) => (
            <EventRow key={event.id} event={event} isLast={i === group.events.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── EVENT ROW ───────────────────────────────────────────────────
function EventRow({ event, isLast }: { event: GitEvent; isLast: boolean }) {
  const { icon, color, description } = getEventDisplay(event);
  const projectPath = useProjectStore(s => s.currentProject?.projectPath);

  const isCommitEvent = (event.type === 'committed' || event.type === 'auto_fixed') && !!event.commitHash;

  const [diffFiles, setDiffFiles] = useState<DiffFile[]>([]);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  const handleClick = async () => {
    if (!isCommitEvent || !projectPath || !event.commitHash) return;

    if (diffOpen) {
      setDiffOpen(false);
      return;
    }

    if (diffFiles.length > 0) {
      setDiffOpen(true);
      return;
    }

    setDiffLoading(true);
    setDiffError(null);
    try {
      const result = await window.api.github.getCommitDiff(projectPath, event.commitHash);
      const files = parseUnifiedDiff(result);
      setDiffFiles(files);
      setDiffOpen(true);
    } catch {
      setDiffError('Failed to load diff');
      setDiffOpen(true);
    } finally {
      setDiffLoading(false);
    }
  };

  return (
    <div className="flex items-start gap-3 relative">
      {/* Connector line */}
      {!isLast && (
        <div className="absolute left-[9px] top-6 bottom-0 w-px bg-border" />
      )}

      {/* Icon */}
      <div className={`w-[18px] h-[18px] mt-1 flex-shrink-0 flex items-center justify-center ${color}`}>
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 pb-3">
        <div
          className={`flex items-center justify-between ${isCommitEvent ? 'cursor-pointer hover:bg-surface px-1 -mx-1 transition-colors' : ''}`}
          onClick={isCommitEvent ? handleClick : undefined}
        >
          <span className="text-sm text-ink">{description}</span>
          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
            {diffLoading && (
              <svg className="w-3 h-3 animate-spin text-ink-muted" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            <span className="text-xs text-ink-muted">{relativeTime(event.timestamp)}</span>
          </div>
        </div>

        {/* Inline diff (styled) */}
        {diffOpen && (
          <div className="mt-2">
            <DiffViewer files={diffFiles} loading={diffLoading} error={diffError} />
          </div>
        )}

        {/* Review detail */}
        {event.type === 'review_completed' && event.reviewArtifact && (
          <ReviewDetail artifact={event.reviewArtifact} />
        )}
      </div>
    </div>
  );
}

function getEventDisplay(event: GitEvent): { icon: JSX.Element; color: string; description: string } {
  switch (event.type) {
    case 'branch_created':
      return {
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        ),
        color: 'text-accent',
        description: `Branch created: ${event.branchName || 'unknown'}`,
      };
    case 'committed':
      return {
        icon: (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="3" />
          </svg>
        ),
        color: 'text-ink-secondary',
        description: `Committed: "${event.commitMessage || ''}"`,
      };
    case 'review_completed': {
      const findingCount = event.reviewArtifact?.findings.length || 0;
      const hasCritical = event.reviewArtifact?.findings.some(f => f.severity === 'critical');
      return {
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        ),
        color: hasCritical ? 'text-error' : 'text-success',
        description: `Review: ${findingCount} finding${findingCount !== 1 ? 's' : ''}`,
      };
    }
    case 'auto_fixed':
      return {
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
        color: 'text-success',
        description: `Auto-fixed: "${event.commitMessage || ''}"`,
      };
    case 'merged':
      return {
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        ),
        color: 'text-success',
        description: 'Merged to main',
      };
    case 'pushed':
      return {
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        ),
        color: 'text-success',
        description: 'Pushed to remote',
      };
    case 'gap_analysis_complete':
      return {
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        color: 'text-success',
        description: event.commitMessage || 'Gap analysis complete',
      };
    case 'deployed':
      return {
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        ),
        color: 'text-success',
        description: event.commitMessage || 'Deployed',
      };
    default:
      return {
        icon: <div className="w-2 h-2 bg-ink-muted/30" />,
        color: 'text-ink-muted',
        description: event.type,
      };
  }
}

// ─── REVIEW DETAIL ───────────────────────────────────────────────
function ReviewDetail({ artifact }: { artifact: GitEvent['reviewArtifact'] }) {
  const [expanded, setExpanded] = useState(false);

  if (!artifact || artifact.findings.length === 0) {
    return (
      <p className="text-xs text-ink-muted mt-1">{artifact?.summary || 'No findings'}</p>
    );
  }

  const criticalCount = artifact.findings.filter(f => f.severity === 'critical').length;
  const warningCount = artifact.findings.filter(f => f.severity === 'warning').length;
  const infoCount = artifact.findings.filter(f => f.severity === 'info').length;

  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-ink-muted hover:text-ink-secondary transition-colors"
      >
        <div className="flex gap-1.5">
          {criticalCount > 0 && (
            <span className="bg-error/15 text-error px-1.5 py-0.5">{criticalCount} critical</span>
          )}
          {warningCount > 0 && (
            <span className="bg-accent/15 text-accent px-1.5 py-0.5">{warningCount} warning</span>
          )}
          {infoCount > 0 && (
            <span className="bg-border text-ink-muted px-1.5 py-0.5">{infoCount} info</span>
          )}
        </div>
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5">
          {artifact.findings.map((finding: ReviewFinding, i: number) => (
            <FindingRow key={i} finding={finding} />
          ))}
          {artifact.summary && (
            <p className="text-xs text-ink-muted mt-2 italic">{artifact.summary}</p>
          )}
        </div>
      )}
    </div>
  );
}

function FindingRow({ finding }: { finding: ReviewFinding }) {
  const severityStyles = {
    critical: 'bg-error/10 border-error/30 text-error',
    warning: 'bg-accent/10 border-accent/30 text-accent',
    info: 'bg-surface border-border text-ink-muted',
  };

  return (
    <div className={`border p-2 text-xs ${severityStyles[finding.severity]}`}>
      <div className="flex items-center gap-2">
        <span className="font-medium">{finding.severity}</span>
        <span className="text-ink-muted">{finding.category}</span>
        {finding.fixed && <span className="text-success">fixed</span>}
      </div>
      <p className="mt-0.5">{finding.description}</p>
      {finding.file && <p className="font-mono text-ink-muted mt-0.5">{finding.file}</p>}
    </div>
  );
}
