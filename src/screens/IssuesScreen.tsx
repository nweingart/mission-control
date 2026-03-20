import { useState, useEffect } from 'react';
import { useProjectStore } from '../store/ProjectStoreContext';
import type { CodeIssue } from '../types';

type SeverityFilter = 'all' | 'critical' | 'warning' | 'info';
type CategoryFilter = 'all' | 'bug' | 'security' | 'performance' | 'dead_code';
type StatusFilter = 'all' | 'open' | 'planned' | 'fixed';

export default function IssuesScreen() {
  const currentProject = useProjectStore(s => s.currentProject);
  const setScreen = useProjectStore(s => s.setScreen);
  const createPlanningChat = useProjectStore(s => s.createPlanningChat);
  const addPlanningMessage = useProjectStore(s => s.addPlanningMessage);
  const goToPlanningChats = useProjectStore(s => s.goToPlanningChats);
  const [issues, setIssues] = useState<CodeIssue[]>([]);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');

  useEffect(() => {
    if (!currentProject) return;
    window.api.storage.getIssues(currentProject.slug).then(setIssues).catch(() => setIssues([]));
  }, [currentProject]);

  if (!currentProject) return null;

  const filtered = issues.filter(issue => {
    if (severityFilter !== 'all' && issue.severity !== severityFilter) return false;
    if (categoryFilter !== 'all' && issue.category !== categoryFilter) return false;
    if (statusFilter !== 'all' && issue.status !== statusFilter) return false;
    return true;
  });

  const counts = {
    total: issues.length,
    open: issues.filter(i => i.status === 'open').length,
    critical: issues.filter(i => i.severity === 'critical' && i.status === 'open').length,
    warning: issues.filter(i => i.severity === 'warning' && i.status === 'open').length,
    info: issues.filter(i => i.severity === 'info' && i.status === 'open').length,
    planned: issues.filter(i => i.status === 'planned').length,
    fixed: issues.filter(i => i.status === 'fixed').length,
  };

  const handleAddToBacklog = async (issue: CodeIssue) => {
    // Create a backlog item directly for quick_fix issues
    const backlog = await window.api.storage.getBacklog(currentProject.slug);
    const newItem = {
      id: `backlog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `Fix: ${issue.title}`,
      description: issue.description + (issue.file ? `\n\nFile: ${issue.file}` : ''),
      priority: issue.severity === 'critical' ? 'high' as const : issue.severity === 'warning' ? 'medium' as const : 'low' as const,
      type: 'bug_fix' as const,
      createdAt: new Date().toISOString(),
    };
    await window.api.storage.saveBacklog(currentProject.slug, [...backlog, newItem]);

    // Update the issue status to planned
    const updated = issues.map(i =>
      i.id === issue.id ? { ...i, status: 'planned' as const, backlogItemId: newItem.id } : i
    );
    await window.api.storage.saveIssues(currentProject.slug, updated);
    setIssues(updated);
  };

  const handlePlanThis = async (issue: CodeIssue) => {
    if (!currentProject) return;

    // Create a planning chat pre-seeded with the issue context
    const chatId = createPlanningChat(`Plan: ${issue.title}`);
    addPlanningMessage({
      role: 'user',
      content: `I want to plan a fix for this issue:\n\n**${issue.title}**\n${issue.description}${issue.file ? `\n\nFile: \`${issue.file}\`` : ''}\n\nSeverity: ${issue.severity} | Category: ${issue.category} | Estimated effort: ${issue.estimatedEffort.replace('_', ' ')}`,
    });

    // Link the issue to the planning chat
    const updated = issues.map(i =>
      i.id === issue.id ? { ...i, status: 'planned' as const, planningChatId: chatId } : i
    );
    await window.api.storage.saveIssues(currentProject.slug, updated);
    setIssues(updated);

    // Navigate to planning chats
    goToPlanningChats();
  };

  const severityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <span className="w-2 h-2 bg-error rounded-full flex-shrink-0" />;
      case 'warning':
        return <span className="w-2 h-2 bg-warning rounded-full flex-shrink-0" />;
      default:
        return <span className="w-2 h-2 bg-ink-muted/30 rounded-full flex-shrink-0" />;
    }
  };

  const categoryLabel: Record<string, string> = {
    bug: 'Bug',
    security: 'Security',
    performance: 'Performance',
    dead_code: 'Dead Code',
  };

  const categoryColor: Record<string, string> = {
    bug: 'bg-spectrum-red/10 text-spectrum-red border-spectrum-red/20',
    security: 'bg-spectrum-orange/10 text-spectrum-orange border-spectrum-orange/20',
    performance: 'bg-spectrum-yellow/10 text-spectrum-yellow border-spectrum-yellow/20',
    dead_code: 'bg-accent/10 text-accent border-accent/20',
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-ink">Issues</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              {counts.open} open &middot; {counts.planned} planned &middot; {counts.fixed} fixed
            </p>
          </div>
          {counts.critical > 0 && (
            <span className="px-2.5 py-1 text-xs font-medium bg-error/10 text-error border border-error/20">
              {counts.critical} critical
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {/* Status filter */}
          <div className="flex items-center gap-1 bg-surface border border-border p-1 rounded-lg">
            {(['all', 'open', 'planned', 'fixed'] as StatusFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  statusFilter === f ? 'bg-ink/10 text-ink' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Severity filter */}
          <div className="flex items-center gap-1 bg-surface border border-border p-1 rounded-lg">
            {(['all', 'critical', 'warning', 'info'] as SeverityFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setSeverityFilter(f)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  severityFilter === f ? 'bg-ink/10 text-ink' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {f === 'all' ? 'All Severity' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Category filter */}
          <div className="flex items-center gap-1 bg-surface border border-border p-1 rounded-lg">
            {(['all', 'bug', 'security', 'performance', 'dead_code'] as CategoryFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setCategoryFilter(f)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  categoryFilter === f ? 'bg-ink/10 text-ink' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {f === 'all' ? 'All Types' : categoryLabel[f] || f}
              </button>
            ))}
          </div>
        </div>

        {/* Issue list */}
        {filtered.length === 0 ? (
          <div className="card-panel p-8 text-center">
            <p className="text-sm text-ink-muted">
              {issues.length === 0 ? 'No issues found. Run a scan to detect issues.' : 'No issues match the current filters.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((issue) => (
              <div key={issue.id} className="card-panel p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-1.5">{severityIcon(issue.severity)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className={`text-sm font-semibold ${issue.status === 'fixed' ? 'text-ink-muted line-through' : 'text-ink'}`}>
                        {issue.title}
                      </h3>
                      <span className={`px-1.5 py-0.5 text-[10px] font-medium border ${categoryColor[issue.category] || ''}`}>
                        {categoryLabel[issue.category] || issue.category}
                      </span>
                      {issue.status === 'planned' && (
                        <span className="px-1.5 py-0.5 text-[10px] bg-accent/10 text-accent border border-accent/20">planned</span>
                      )}
                      {issue.status === 'fixed' && (
                        <span className="px-1.5 py-0.5 text-[10px] bg-success/10 text-success border border-success/20">fixed</span>
                      )}
                    </div>
                    <p className="text-xs text-ink-muted">{issue.description}</p>
                    {issue.file && (
                      <p className="text-[10px] text-ink-muted font-mono mt-1">{issue.file}</p>
                    )}
                  </div>

                  {/* Actions */}
                  {issue.status === 'open' && (
                    <div className="flex-shrink-0">
                      {issue.estimatedEffort === 'quick_fix' ? (
                        <button
                          onClick={() => handleAddToBacklog(issue)}
                          className="text-xs text-accent hover:text-accent/80 font-medium whitespace-nowrap"
                        >
                          Add to Backlog
                        </button>
                      ) : (
                        <button
                          onClick={() => handlePlanThis(issue)}
                          className="text-xs text-accent hover:text-accent/80 font-medium whitespace-nowrap"
                        >
                          Plan This
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
