import type { TaskPhase, ReviewArtifact, ReviewFinding } from '../types';

interface ReviewPanelProps {
  taskPhase: TaskPhase;
  taskTitle: string;
  currentBranch: string;
  reviewArtifact: ReviewArtifact | null;
  reviewHistory: ReviewArtifact[];
  reviewOutput: string;
}

export default function ReviewPanel({
  taskPhase,
  taskTitle,
  currentBranch,
  reviewArtifact,
  reviewHistory,
  reviewOutput,
}: ReviewPanelProps) {
  return (
    <div className="h-full flex flex-col bg-surface border border-border overflow-hidden">
      {/* Review header */}
      <div className="px-4 py-3 border-b border-border bg-surface-card">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-sans font-semibold text-ink">
            Code Review: {taskTitle}
          </h3>
          <span className="text-[13px] font-mono bg-border text-ink-secondary px-2 py-1">
            {currentBranch}
          </span>
        </div>
        {reviewArtifact?.diffStat && (
          <p className="text-xs text-ink-muted mt-1 font-mono">
            {reviewArtifact.diffStat}
          </p>
        )}
      </div>

      {/* Review body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Streaming output during review */}
        {taskPhase === 'reviewing' && !reviewArtifact && reviewOutput && (
          <div className="card-panel p-3">
            <p className="text-[13px] font-display uppercase tracking-wider text-ink-muted mb-2">Reviewing...</p>
            <pre className="text-sm text-ink whitespace-pre-wrap font-mono">
              {reviewOutput}
            </pre>
          </div>
        )}

        {/* Fixing indicator */}
        {taskPhase === 'fixing' && (
          <div className="flex items-center gap-2 text-spectrum-orange bg-spectrum-orange/10 p-3">
            <div className="w-4 h-4 border-4 border-spectrum-orange border-t-transparent animate-spin" />
            <span className="text-[13px] font-display uppercase tracking-wider">Auto-fixing issues...</span>
          </div>
        )}

        {/* Findings list */}
        {reviewArtifact && reviewArtifact.findings.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-base font-sans font-semibold text-ink">Findings</h4>
            {reviewArtifact.findings.map((finding, i) => (
              <FindingCard key={i} finding={finding} />
            ))}
          </div>
        )}

        {/* Summary */}
        {reviewArtifact?.summary && (
          <div className="card-panel p-3">
            <h4 className="text-base font-sans font-semibold text-ink mb-1">Summary</h4>
            <p className="text-sm text-ink-secondary">{reviewArtifact.summary}</p>
          </div>
        )}

        {/* Auto-fix badge */}
        {reviewArtifact?.autoFixApplied && (
          <div className="flex items-center gap-2 text-success text-sm">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Auto-fix applied
          </div>
        )}

        {/* Previous reviews */}
        {reviewHistory.length > 0 && (
          <div className="border-t border-border pt-4 mt-4">
            <h4 className="text-sm font-sans font-medium text-ink-muted mb-2">
              Previous Reviews ({reviewHistory.length})
            </h4>
            <div className="space-y-2">
              {reviewHistory.map((artifact, i) => (
                <div key={i} className="card-panel p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-ink">{artifact.taskTitle}</span>
                    <span className="text-xs text-ink-muted font-mono">{artifact.diffStat}</span>
                  </div>
                  <p className="text-xs text-ink-muted">{artifact.summary}</p>
                  {artifact.findings.length > 0 && (
                    <div className="flex gap-2 mt-1">
                      {artifact.findings.filter((f) => f.severity === 'critical').length > 0 && (
                        <span className="text-xs bg-error/15 text-error px-1.5 py-0.5">
                          {artifact.findings.filter((f) => f.severity === 'critical').length} critical
                        </span>
                      )}
                      {artifact.findings.filter((f) => f.severity === 'warning').length > 0 && (
                        <span className="text-xs bg-accent/15 text-accent px-1.5 py-0.5">
                          {artifact.findings.filter((f) => f.severity === 'warning').length} warning
                        </span>
                      )}
                      {artifact.autoFixApplied && (
                        <span className="text-xs text-success">auto-fixed</span>
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

// ─── FINDING CARD ──────────────────────────────────────────────
function FindingCard({ finding }: { finding: ReviewFinding }) {
  const severityStyles = {
    critical: {
      bg: 'bg-error/10',
      border: 'border-error/30',
      badge: 'bg-error/15 text-error',
      text: 'text-error',
    },
    warning: {
      bg: 'bg-accent/10',
      border: 'border-accent/30',
      badge: 'bg-accent/15 text-accent',
      text: 'text-accent',
    },
    info: {
      bg: 'bg-accent/10',
      border: 'border-accent/30',
      badge: 'bg-accent/15 text-accent',
      text: 'text-accent',
    },
  };

  const styles = severityStyles[finding.severity];

  return (
    <div className={`border p-3 ${styles.bg} ${styles.border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[13px] font-display uppercase tracking-wider px-2 py-0.5 ${styles.badge}`}>
              {finding.severity}
            </span>
            <span className="text-xs text-ink-muted">{finding.category}</span>
            {finding.fixed && (
              <span className="text-xs text-success flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Fixed
              </span>
            )}
          </div>
          <p className={`text-sm ${styles.text}`}>{finding.description}</p>
          {finding.file && (
            <p className="text-xs text-ink-muted mt-1 font-mono">{finding.file}</p>
          )}
        </div>
      </div>
    </div>
  );
}
