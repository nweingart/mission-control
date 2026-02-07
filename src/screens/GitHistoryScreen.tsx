import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { GitEvent, ReviewFinding } from '../types';

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
  const { gitEvents, loadGitEvents } = useAppStore();

  useEffect(() => {
    loadGitEvents();
  }, [loadGitEvents]);

  const groups = groupByTask(gitEvents);

  // Summary stats
  const totalTasks = groups.filter(g => g.taskId !== '__other__').length;
  const mergedCount = gitEvents.filter(e => e.type === 'merged').length;
  const fixedCount = gitEvents.filter(e => e.type === 'auto_fixed').length;

  if (gitEvents.length === 0) {
    return (
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-charcoal-700 flex items-center justify-center">
              <svg className="w-8 h-8 text-charcoal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-cream-100 mb-2">No git history yet</h3>
            <p className="text-charcoal-300 text-sm max-w-sm">
              History will appear once building begins. Each task will show branches, commits, reviews, and merges.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="bg-charcoal-800 border-b border-charcoal-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-cream-100">Git History</h1>
          <span className="text-sm text-charcoal-300">{gitEvents.length} events</span>
        </div>
      </header>

      {/* Timeline */}
      <main className="flex-1 overflow-y-auto p-6 space-y-4">
        {groups.map((group) => (
          <TaskGroup key={group.taskId} group={group} />
        ))}

        {/* Summary bar */}
        <div className="bg-charcoal-800 rounded-lg border border-charcoal-600 p-4 mt-6">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-charcoal-300">Tasks:</span>
              <span className="text-cream-100 font-medium">{totalTasks}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-charcoal-300">Branches merged:</span>
              <span className="text-sage-500 font-medium">{mergedCount}</span>
            </div>
            {fixedCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-charcoal-300">Auto-fixed:</span>
                <span className="text-terracotta-500 font-medium">{fixedCount}</span>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── TASK GROUP ──────────────────────────────────────────────────
function TaskGroup({ group }: { group: { taskId: string; taskTitle: string; events: GitEvent[] } }) {
  const [collapsed, setCollapsed] = useState(false);

  const branchName = group.events.find(e => e.branchName)?.branchName;
  const isMerged = group.events.some(e => e.type === 'merged');

  return (
    <div className="bg-charcoal-800 rounded-lg border border-charcoal-600 overflow-hidden">
      {/* Group header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-charcoal-700 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${isMerged ? 'bg-sage-500' : 'bg-terracotta-500'}`} />
          <span className="text-sm font-medium text-cream-100">{group.taskTitle}</span>
        </div>
        <div className="flex items-center gap-3">
          {branchName && (
            <span className="text-xs font-mono text-charcoal-400">
              main {isMerged ? '\u2190' : '\u2194'} {branchName}
            </span>
          )}
          {isMerged && (
            <span className="text-xs bg-sage-500/15 text-sage-400 px-2 py-0.5 rounded">merged</span>
          )}
          <svg
            className={`w-4 h-4 text-charcoal-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Events */}
      {!collapsed && (
        <div className="border-t border-charcoal-700 px-4 py-2">
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

  return (
    <div className="flex items-start gap-3 relative">
      {/* Connector line */}
      {!isLast && (
        <div className="absolute left-[9px] top-6 bottom-0 w-px bg-charcoal-600" />
      )}

      {/* Icon */}
      <div className={`w-[18px] h-[18px] mt-1 flex-shrink-0 flex items-center justify-center ${color}`}>
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 pb-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-cream-100">{description}</span>
          <span className="text-xs text-charcoal-400 ml-2 flex-shrink-0">{relativeTime(event.timestamp)}</span>
        </div>

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
        color: 'text-terracotta-500',
        description: `Branch created: ${event.branchName || 'unknown'}`,
      };
    case 'committed':
      return {
        icon: (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="3" />
          </svg>
        ),
        color: 'text-cream-300',
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
        color: hasCritical ? 'text-rust-500' : 'text-sage-500',
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
        color: 'text-sage-500',
        description: `Auto-fixed: "${event.commitMessage || ''}"`,
      };
    case 'merged':
      return {
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        ),
        color: 'text-sage-500',
        description: 'Merged to main',
      };
    case 'pushed':
      return {
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        ),
        color: 'text-sage-500',
        description: 'Pushed to remote',
      };
    case 'deployed':
      return {
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        ),
        color: 'text-sage-500',
        description: event.commitMessage || 'Deployed to Vercel',
      };
    default:
      return {
        icon: <div className="w-2 h-2 rounded-full bg-charcoal-400" />,
        color: 'text-charcoal-400',
        description: event.type,
      };
  }
}

// ─── REVIEW DETAIL ───────────────────────────────────────────────
function ReviewDetail({ artifact }: { artifact: GitEvent['reviewArtifact'] }) {
  const [expanded, setExpanded] = useState(false);

  if (!artifact || artifact.findings.length === 0) {
    return (
      <p className="text-xs text-charcoal-300 mt-1">{artifact?.summary || 'No findings'}</p>
    );
  }

  const criticalCount = artifact.findings.filter(f => f.severity === 'critical').length;
  const warningCount = artifact.findings.filter(f => f.severity === 'warning').length;
  const infoCount = artifact.findings.filter(f => f.severity === 'info').length;

  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-charcoal-300 hover:text-charcoal-200 transition-colors"
      >
        <div className="flex gap-1.5">
          {criticalCount > 0 && (
            <span className="bg-rust-500/15 text-rust-400 px-1.5 py-0.5 rounded">{criticalCount} critical</span>
          )}
          {warningCount > 0 && (
            <span className="bg-terracotta-500/15 text-terracotta-400 px-1.5 py-0.5 rounded">{warningCount} warning</span>
          )}
          {infoCount > 0 && (
            <span className="bg-charcoal-600 text-charcoal-300 px-1.5 py-0.5 rounded">{infoCount} info</span>
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
            <p className="text-xs text-charcoal-300 mt-2 italic">{artifact.summary}</p>
          )}
        </div>
      )}
    </div>
  );
}

function FindingRow({ finding }: { finding: ReviewFinding }) {
  const severityStyles = {
    critical: 'bg-rust-500/10 border-rust-500/30 text-rust-400',
    warning: 'bg-terracotta-500/10 border-terracotta-500/30 text-terracotta-400',
    info: 'bg-charcoal-700 border-charcoal-600 text-charcoal-300',
  };

  return (
    <div className={`rounded border p-2 text-xs ${severityStyles[finding.severity]}`}>
      <div className="flex items-center gap-2">
        <span className="font-medium">{finding.severity}</span>
        <span className="text-charcoal-400">{finding.category}</span>
        {finding.fixed && <span className="text-sage-500">fixed</span>}
      </div>
      <p className="mt-0.5">{finding.description}</p>
      {finding.file && <p className="font-mono text-charcoal-400 mt-0.5">{finding.file}</p>}
    </div>
  );
}
