import { useEffect, useMemo } from 'react';
import { useProjectStore } from '../store/ProjectStoreContext';
import type { DeploymentRecord } from '../types';
import AssistantCallout from '../components/AssistantCallout';

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) + ' \u2014 ' + date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: DeploymentRecord['status'] }) {
  const styles: Record<DeploymentRecord['status'], string> = {
    success: 'bg-success/15 text-success',
    failed: 'bg-error/15 text-error',
    deploying: 'bg-accent/15 text-accent',
    watching: 'bg-accent/15 text-accent',
    pushing: 'bg-accent/15 text-accent',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium uppercase ${styles[status]}`}>
      {status}
    </span>
  );
}

export default function DeploymentsScreen() {
  const deployments = useProjectStore(s => s.deployments);
  const loadDeployments = useProjectStore(s => s.loadDeployments);
  const setScreen = useProjectStore(s => s.setScreen);

  useEffect(() => {
    loadDeployments();
  }, [loadDeployments]);

  const sorted = useMemo(
    () => [...deployments].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [deployments]
  );

  if (sorted.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto space-y-4">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="mb-2">
            <h2 className="text-xl font-bold text-ink">Deployments</h2>
            <p className="text-xs text-ink-muted mt-0.5">No deployments yet</p>
          </div>
          <AssistantCallout
            message="No deployments yet."
            ctaLabel="View Build"
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
            <h2 className="text-xl font-bold text-ink">Deployments</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              {sorted.length} deployment{sorted.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Deployment cards */}
        <div className="space-y-3">
          {sorted.map((deployment) => (
            <DeploymentCard key={deployment.id} deployment={deployment} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DeploymentCard({ deployment }: { deployment: DeploymentRecord }) {
  const shortHash = deployment.commitHash ? deployment.commitHash.slice(0, 7) : '';

  return (
    <div className="card-panel p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-ink-muted">{formatTimestamp(deployment.timestamp)}</span>
        <StatusBadge status={deployment.status} />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-ink-muted">Branch:</span>
          <span className="text-ink font-mono text-xs">{deployment.branch}</span>
        </div>

        {shortHash && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink-muted">Commit:</span>
            <span className="text-ink font-mono text-xs">{shortHash}</span>
            {deployment.commitMessage && (
              <span className="text-ink-muted text-xs truncate">
                &quot;{deployment.commitMessage}&quot;
              </span>
            )}
          </div>
        )}

        {deployment.githubRepoUrl && (
          <button
            onClick={() => window.api.shell.openExternal(deployment.githubRepoUrl!)}
            className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            <span className="text-xs font-mono truncate">{deployment.githubRepoUrl}</span>
          </button>
        )}

        {deployment.status === 'failed' && deployment.error && (
          <div className="mt-1 text-xs text-error bg-error/10 border border-error/20 p-2">
            {deployment.error}
          </div>
        )}
      </div>
    </div>
  );
}
