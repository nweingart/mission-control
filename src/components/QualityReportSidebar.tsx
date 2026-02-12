import { useState } from 'react';
import type { GapAnalysis, GapFinding, GitEvent, ReviewArtifact } from '../types';

interface QualityReportSidebarProps {
  gapAnalyses: GapAnalysis[];
  gitEvents: GitEvent[];
  collapsed: boolean;
  onToggle: () => void;
  onFixFindings: (findings: GapFinding[], remainingItems: string[]) => void;
  isFixing: boolean;
}

export default function QualityReportSidebar({
  gapAnalyses,
  gitEvents,
  collapsed,
  onToggle,
  onFixFindings,
  isFixing,
}: QualityReportSidebarProps) {
  if (gapAnalyses.length === 0) return null;

  // Use the most recent analysis for the grade display
  const latestAnalysis = gapAnalyses[gapAnalyses.length - 1];
  const grade = latestAnalysis.validatedGrade;

  const gradeColor = grade >= 95 ? 'text-success'
    : grade >= 80 ? 'text-accent'
    : 'text-error';

  const gradeBg = grade >= 95 ? 'bg-success/15'
    : grade >= 80 ? 'bg-accent/15'
    : 'bg-error/15';

  const unresolvedFindings = latestAnalysis.findings.filter(f => !f.resolved);
  const hasFixableItems = unresolvedFindings.length > 0 || latestAnalysis.remainingItems.length > 0;
  const showFixButton = grade < 95 && hasFixableItems;

  // Extract review artifacts from git events
  const reviewEvents = gitEvents.filter(e => e.type === 'review_completed' && e.reviewArtifact);

  if (collapsed) {
    return (
      <aside className="w-10 bg-surface border-l border-border flex flex-col items-center py-4 flex-shrink-0">
        <button
          onClick={onToggle}
          className="text-ink-muted hover:text-ink transition-colors"
          title="Expand quality report"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {/* Vertical grade badge */}
        <div className={`mt-4 px-1 py-2 ${gradeBg} ${gradeColor} text-xs font-bold text-center`}>
          {grade}
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-72 bg-surface border-l border-border flex flex-col flex-shrink-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-lg font-sans font-semibold text-ink">Quality Report</h3>
        <button
          onClick={onToggle}
          className="text-ink-muted hover:text-ink transition-colors"
          title="Collapse quality report"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Grade badge */}
        <div className="p-4">
          <div className={`${gradeBg} p-4 text-center`}>
            <div className={`text-3xl font-bold ${gradeColor}`}>
              {grade}<span className="text-sm text-ink-muted"> / 100</span>
            </div>
            <div className={`text-[13px] font-display uppercase tracking-wider mt-1 ${gradeColor}`}>
              {grade >= 95 ? 'PASS' : grade >= 80 ? 'ACCEPTABLE' : 'NEEDS WORK'}
            </div>
          </div>
          {showFixButton && (
            <button
              onClick={() => onFixFindings(unresolvedFindings, latestAnalysis.remainingItems)}
              disabled={isFixing}
              className="btn-solid-primary mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isFixing ? (
                <>
                  <div className="w-4 h-4 border-4 border-surface-light border-t-transparent animate-spin" />
                  <span className="text-sm font-medium">Fixing...</span>
                </>
              ) : (
                <span className="text-sm font-medium">Fix These</span>
              )}
            </button>
          )}
        </div>

        {/* Gap findings */}
        {latestAnalysis.findings.length > 0 && (
          <div className="px-4 pb-4">
            <h4 className="text-sm font-sans font-medium text-ink-muted mb-2">
              Gap Findings ({latestAnalysis.findings.length})
            </h4>
            <div className="space-y-2">
              {latestAnalysis.findings.map((finding, i) => (
                <FindingItem key={i} finding={finding} />
              ))}
            </div>
          </div>
        )}

        {/* Remaining items */}
        {latestAnalysis.remainingItems.length > 0 && (
          <div className="px-4 pb-4">
            <h4 className="text-sm font-sans font-medium text-ink-muted mb-2">
              Remaining Items
            </h4>
            <ul className="space-y-1">
              {latestAnalysis.remainingItems.map((item, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-ink-secondary">
                  <span className="text-ink-muted mt-0.5">&#8226;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Review summaries from build */}
        {reviewEvents.length > 0 && (
          <div className="px-4 pb-4 border-t border-border-subtle pt-4">
            <h4 className="text-sm font-sans font-medium text-ink-muted mb-2">
              Task Reviews ({reviewEvents.length})
            </h4>
            <div className="space-y-2">
              {reviewEvents.map((event) => (
                <ReviewSummaryItem key={event.id} event={event} />
              ))}
            </div>
          </div>
        )}

        {/* Analysis passes */}
        {gapAnalyses.length > 1 && (
          <div className="px-4 pb-4 border-t border-border-subtle pt-4">
            <h4 className="text-sm font-sans font-medium text-ink-muted mb-2">
              Analysis History
            </h4>
            <div className="space-y-1.5">
              {gapAnalyses.map((analysis) => (
                <div key={analysis.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-ink-muted">Pass {analysis.pass}</span>
                    {analysis.fixesApplied && (
                      <span className="text-success" title="Auto-fixes applied">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                        </svg>
                      </span>
                    )}
                  </div>
                  <span className={`font-mono font-medium ${
                    analysis.validatedGrade >= 95 ? 'text-success' :
                    analysis.validatedGrade >= 80 ? 'text-accent' :
                    'text-error'
                  }`}>
                    {analysis.validatedGrade}/100
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Finding Item ────────────────────────────────────────────
function FindingItem({ finding }: { finding: GapFinding }) {
  const [expanded, setExpanded] = useState(false);

  const severityColor = {
    missing: 'text-error',
    incomplete: 'text-accent',
    deviation: 'text-accent',
  }[finding.severity];

  const severityBg = {
    missing: 'bg-error/15',
    incomplete: 'bg-accent/15',
    deviation: 'bg-accent/15',
  }[finding.severity];

  return (
    <div className="card-panel border border-border-subtle">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-start gap-2 text-left hover:bg-surface transition-colors"
      >
        <span className={`text-[13px] font-display uppercase tracking-wider px-1.5 py-0.5 ${severityBg} ${severityColor} flex-shrink-0 mt-0.5`}>
          {finding.severity}
        </span>
        <span className="text-xs text-ink-secondary flex-1 line-clamp-2">{finding.category}</span>
        {finding.resolved && (
          <svg className="w-3 h-3 text-success flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-2 border-t border-border-subtle pt-2">
          <p className="text-xs text-ink-muted">{finding.description}</p>
          {finding.prdSection && (
            <p className="text-xs text-ink-muted mt-1">PRD: {finding.prdSection}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Review Summary Item ─────────────────────────────────────
function ReviewSummaryItem({ event }: { event: GitEvent }) {
  const [expanded, setExpanded] = useState(false);
  const artifact = event.reviewArtifact as ReviewArtifact | undefined;
  if (!artifact) return null;

  const criticalCount = artifact.findings.filter(f => f.severity === 'critical').length;
  const warningCount = artifact.findings.filter(f => f.severity === 'warning').length;

  return (
    <div className="card-panel border border-border-subtle">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 text-left hover:bg-surface transition-colors"
      >
        <div className="text-xs text-ink font-medium truncate">{artifact.taskTitle}</div>
        <div className="flex items-center gap-1.5 mt-1">
          {criticalCount > 0 && (
            <span className="text-xs bg-error/15 text-error px-1 py-0.5">{criticalCount}c</span>
          )}
          {warningCount > 0 && (
            <span className="text-xs bg-accent/15 text-accent px-1 py-0.5">{warningCount}w</span>
          )}
          {artifact.autoFixApplied && (
            <span className="text-xs text-success">fixed</span>
          )}
          {artifact.findings.length === 0 && (
            <span className="text-xs text-success">clean</span>
          )}
        </div>
      </button>
      {expanded && artifact.summary && (
        <div className="px-3 pb-2 border-t border-border-subtle pt-2">
          <p className="text-xs text-ink-muted">{artifact.summary}</p>
        </div>
      )}
    </div>
  );
}
