import type { Project, Task, BacklogItem, Sprint, GitEvent, DeploymentRecord, FeatureModule, CodeIssue, ProjectStatus, Screen } from '../../types';
import { getBacklogItemStatus } from '../../utils/backlogStatus';

const statusLabel: Record<ProjectStatus, string> = {
  idea: 'Idea',
  discovery: 'Discovery',
  prd_review: 'PRD Review',
  planning: 'Planning',
  building: 'Building',
  previewing: 'Preview',
  deploying: 'Deploying',
  complete: 'Complete',
};

const statusColor: Record<ProjectStatus, string> = {
  idea: 'bg-accent/20 text-accent',
  discovery: 'bg-spectrum-purple/20 text-spectrum-purple',
  prd_review: 'bg-spectrum-purple/20 text-spectrum-purple',
  planning: 'bg-spectrum-yellow/20 text-spectrum-yellow',
  building: 'bg-spectrum-orange/20 text-spectrum-orange',
  previewing: 'bg-spectrum-green/20 text-spectrum-green',
  deploying: 'bg-accent/20 text-accent',
  complete: 'bg-spectrum-green/20 text-spectrum-green',
};

function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface OverviewPanelProps {
  currentProject: Project;
  tasks: Task[];
  backlog: BacklogItem[];
  sprints: Sprint[];
  gitEvents: GitEvent[];
  deployments: DeploymentRecord[];
  features: FeatureModule[];
  issues: CodeIssue[];
  setScreen: (screen: Screen) => void;
}

export default function OverviewPanel({
  currentProject, tasks, backlog, sprints, gitEvents, deployments, features, issues, setScreen,
}: OverviewPanelProps) {
    const completedTasks = tasks.filter((t) => t.completed).length;
    const totalTasks = tasks.length;
    const latestDeployment = deployments.length > 0
      ? [...deployments].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]
      : null;

    // Backlog status counts (derived from sprint status)
    const statusCounts = {
      todo: backlog.filter((b) => getBacklogItemStatus(b, sprints) === 'todo').length,
      in_progress: backlog.filter((b) => getBacklogItemStatus(b, sprints) === 'in_progress').length,
      done: backlog.filter((b) => getBacklogItemStatus(b, sprints) === 'done').length,
    };
    const totalBacklog = backlog.length;

    // Priority counts
    const priorityCounts = {
      high: backlog.filter((b) => b.priority === 'high').length,
      medium: backlog.filter((b) => b.priority === 'medium').length,
      low: backlog.filter((b) => b.priority === 'low').length,
    };

    // Recent activity: merge gitEvents + deployments, sort by timestamp, take 5
    const recentActivity = [
      ...gitEvents.map((e) => ({
        id: e.id,
        type: 'git' as const,
        description: e.commitMessage || e.taskTitle || e.type.replace(/_/g, ' '),
        timestamp: e.timestamp,
        eventType: e.type,
      })),
      ...deployments.map((d) => ({
        id: d.id,
        type: 'deploy' as const,
        description: d.commitMessage || `Deploy to ${d.branch}`,
        timestamp: d.timestamp,
        eventType: d.status,
      })),
    ]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);

    const hasStatusData = statusCounts.in_progress > 0 || statusCounts.done > 0;

    const openIssues = issues.filter(i => i.status === 'open');
    const criticalIssues = openIssues.filter(i => i.severity === 'critical');
    const isV2 = currentProject.scanStatus === 'complete';

    return (
      <div className="max-w-5xl mx-auto space-y-6">
        {/* V2: Scan summary + tech stack */}
        {isV2 && currentProject.techStack && (
          <div className="card-panel p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-ink">Codebase</h3>
                <span className="text-xs text-ink-muted">
                  Last scanned {currentProject.lastScannedAt ? new Date(currentProject.lastScannedAt).toLocaleDateString() : 'never'}
                </span>
              </div>
              <button
                onClick={() => setScreen('scanning')}
                className="text-xs text-accent hover:text-accent/80 transition-colors font-medium"
              >
                Re-scan
              </button>
            </div>
            <p className="text-sm text-ink-secondary mb-3">{currentProject.techStack.summary}</p>
            <div className="flex flex-wrap gap-1.5">
              {[...currentProject.techStack.languages, ...currentProject.techStack.frameworks, ...currentProject.techStack.buildTools].map((tech, i) => (
                <span key={i} className="px-2 py-0.5 text-xs bg-surface-light border border-border text-ink-muted">{tech}</span>
              ))}
            </div>
          </div>
        )}

        {/* V2: Issues summary */}
        {isV2 && openIssues.length > 0 && (
          <div className="card-panel p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-ink">Open Issues</h3>
              <button
                onClick={() => setScreen('issues')}
                className="text-xs text-accent hover:text-accent/80 transition-colors font-medium"
              >
                View All
              </button>
            </div>
            <div className="flex items-center gap-4 text-sm">
              {criticalIssues.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-error rounded-full" />
                  <span className="text-error font-medium">{criticalIssues.length} critical</span>
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-warning rounded-full" />
                <span className="text-ink-muted">{openIssues.filter(i => i.severity === 'warning').length} warnings</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-ink-muted/30 rounded-full" />
                <span className="text-ink-muted">{openIssues.filter(i => i.severity === 'info').length} info</span>
              </span>
            </div>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Backlog card */}
          <div className="card-panel p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="p-2 bg-accent/15 text-accent rounded-md">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-ink-muted">Backlog</h3>
            </div>
            <p className="text-3xl font-bold text-ink">{totalBacklog}</p>
            <p className="text-xs text-ink-muted mt-1">
              {priorityCounts.high > 0 && <span className="text-spectrum-orange">{priorityCounts.high} high</span>}
              {priorityCounts.high > 0 && priorityCounts.medium > 0 && ' · '}
              {priorityCounts.medium > 0 && <span className="text-spectrum-yellow">{priorityCounts.medium} med</span>}
              {(priorityCounts.high > 0 || priorityCounts.medium > 0) && priorityCounts.low > 0 && ' · '}
              {priorityCounts.low > 0 && <span className="text-accent">{priorityCounts.low} low</span>}
              {totalBacklog === 0 && 'No items yet'}
            </p>
          </div>

          {/* Build Tasks card */}
          <div className="card-panel p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="p-2 bg-spectrum-orange/15 text-spectrum-orange rounded-md">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-ink-muted">Build Tasks</h3>
            </div>
            <p className="text-3xl font-bold text-ink">
              {completedTasks}<span className="text-lg font-normal text-ink-muted">/{totalTasks}</span>
            </p>
            <p className="text-xs text-ink-muted mt-1">
              {totalTasks === 0 ? 'No tasks yet' : completedTasks === totalTasks ? 'All complete' : `${totalTasks - completedTasks} remaining`}
            </p>
          </div>

          {/* Deployments card */}
          <div className="card-panel p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="p-2 bg-spectrum-purple/15 text-spectrum-purple rounded-md">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-ink-muted">Deployments</h3>
            </div>
            <p className="text-3xl font-bold text-ink">{deployments.length}</p>
            <p className="text-xs text-ink-muted mt-1">
              {latestDeployment ? (
                <span className={latestDeployment.status === 'success' ? 'text-spectrum-green' : latestDeployment.status === 'failed' ? 'text-spectrum-red' : 'text-spectrum-yellow'}>
                  Latest: {latestDeployment.status}
                </span>
              ) : (
                'No deployments yet'
              )}
            </p>
          </div>

          {/* Features card (V2) or Status card (V1) */}
          {currentProject.scanStatus === 'complete' ? (
            <div className="card-panel p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="p-2 bg-spectrum-green/15 text-spectrum-green rounded-md">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-ink-muted">Features</h3>
              </div>
              <p className="text-3xl font-bold text-ink">{features.length}</p>
              <p className="text-xs text-ink-muted mt-1">
                {features.length === 0 ? 'No features detected' : `${features.filter(f => f.status === 'documented').length} documented`}
              </p>
            </div>
          ) : (
            <div className="card-panel p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="p-2 bg-spectrum-green/15 text-spectrum-green rounded-md">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-ink-muted">Status</h3>
              </div>
              <div className="mt-1">
                <span className={`px-2 py-0.5 text-xs font-medium ${currentProject.status ? statusColor[currentProject.status] : 'bg-surface-light text-ink-muted'}`}>
                  {currentProject.status ? statusLabel[currentProject.status] : 'Imported'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Backlog status bar */}
        {totalBacklog > 0 && (
          <div className="card-panel p-4">
            <h3 className="text-base font-sans font-semibold text-ink-muted mb-3">
              {hasStatusData ? 'Backlog Progress' : 'Backlog by Priority'}
            </h3>
            {hasStatusData ? (
              <>
                <div className="flex overflow-hidden h-3 bg-surface-light">
                  {statusCounts.done > 0 && (
                    <div
                      className="bg-spectrum-green transition-all"
                      style={{ width: `${(statusCounts.done / totalBacklog) * 100}%` }}
                    />
                  )}
                  {statusCounts.in_progress > 0 && (
                    <div
                      className="bg-spectrum-orange transition-all"
                      style={{ width: `${(statusCounts.in_progress / totalBacklog) * 100}%` }}
                    />
                  )}
                  {statusCounts.todo > 0 && (
                    <div
                      className="bg-surface transition-all"
                      style={{ width: `${(statusCounts.todo / totalBacklog) * 100}%` }}
                    />
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-ink-muted">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-spectrum-green" /> Done {statusCounts.done}</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-spectrum-orange" /> In Progress {statusCounts.in_progress}</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-surface" /> To Do {statusCounts.todo}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex overflow-hidden h-3 bg-surface-light">
                  {priorityCounts.high > 0 && (
                    <div
                      className="bg-spectrum-orange transition-all"
                      style={{ width: `${(priorityCounts.high / totalBacklog) * 100}%` }}
                    />
                  )}
                  {priorityCounts.medium > 0 && (
                    <div
                      className="bg-spectrum-yellow transition-all"
                      style={{ width: `${(priorityCounts.medium / totalBacklog) * 100}%` }}
                    />
                  )}
                  {priorityCounts.low > 0 && (
                    <div
                      className="bg-accent transition-all"
                      style={{ width: `${(priorityCounts.low / totalBacklog) * 100}%` }}
                    />
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-ink-muted">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-spectrum-orange" /> High {priorityCounts.high}</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-spectrum-yellow" /> Medium {priorityCounts.medium}</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-accent" /> Low {priorityCounts.low}</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Recent Activity */}
        <div className="card-panel p-4">
          <h3 className="text-base font-sans font-semibold text-ink-muted mb-3">Recent Activity</h3>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-ink-muted py-4 text-center">No activity yet</p>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <div className={`p-1.5 flex-shrink-0 ${
                    activity.type === 'deploy'
                      ? 'bg-accent/10 text-accent'
                      : 'bg-surface-light text-ink-muted'
                  }`}>
                    {activity.type === 'deploy' ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink truncate">{activity.description}</p>
                  </div>
                  <span className="text-xs text-ink-muted flex-shrink-0">{relativeTime(activity.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
}
