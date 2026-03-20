import { useState, useEffect, useCallback } from 'react';
import mcAvatar from '../../assets/mc-avatar.webp';

interface StageIntroProps {
  onComplete: () => void;
}

// ─── Panel 1: Animated Repo Import ───────────────────────────────────

const CLONE_STEPS = [
  { text: 'github.com/acme/web-app', phase: 'url' as const },
  { text: 'Cloning repository...', phase: 'cloning' as const },
  { text: 'Found 847 files across 42 directories', phase: 'analyzing' as const },
  { text: 'Repository imported!', phase: 'done' as const },
];

function MiniImport() {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (stepIdx >= CLONE_STEPS.length - 1) {
      const timer = setTimeout(() => setStepIdx(0), 3000);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setStepIdx((s) => s + 1), 1800);
    return () => clearTimeout(timer);
  }, [stepIdx]);

  const step = CLONE_STEPS[stepIdx];

  return (
    <div className="w-full border border-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span className="text-xs font-sans font-semibold text-ink">Import Project</span>
      </div>

      {/* Content */}
      <div className="p-4 h-[160px] flex flex-col justify-center">
        {/* URL input mock */}
        <div className="mb-4">
          <div className="text-[10px] text-ink-muted mb-1.5">GitHub Repository URL</div>
          <div className="flex items-center border border-border bg-surface-card px-3 py-2">
            <svg className="w-3.5 h-3.5 text-ink-muted mr-2 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            <span className={`text-[11px] font-mono transition-all duration-300 ${
              step.phase === 'url' ? 'text-ink' : 'text-ink-muted'
            }`}>
              {CLONE_STEPS[0].text}
            </span>
          </div>
        </div>

        {/* Progress steps */}
        <div className="space-y-2">
          {stepIdx >= 1 && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-1">
              {step.phase === 'cloning' ? (
                <div className="w-3 h-3 border-2 border-accent border-t-transparent animate-spin flex-shrink-0" />
              ) : (
                <svg className="w-3 h-3 text-success flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
              <span className={`text-[11px] ${step.phase === 'cloning' ? 'text-accent' : 'text-ink-muted'}`}>
                {CLONE_STEPS[1].text}
              </span>
            </div>
          )}
          {stepIdx >= 2 && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-1">
              {step.phase === 'analyzing' ? (
                <div className="w-3 h-3 border-2 border-accent border-t-transparent animate-spin flex-shrink-0" />
              ) : (
                <svg className="w-3 h-3 text-success flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
              <span className={`text-[11px] ${step.phase === 'analyzing' ? 'text-accent' : 'text-ink-muted'}`}>
                {CLONE_STEPS[2].text}
              </span>
            </div>
          )}
          {stepIdx >= 3 && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-1">
              <svg className="w-3 h-3 text-success flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-[11px] text-success font-medium">{CLONE_STEPS[3].text}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Panel 2: Animated Issue Scanner ─────────────────────────────────

const SCAN_ISSUES = [
  { title: 'SQL injection in user query endpoint', severity: 'critical' as const },
  { title: 'Missing auth middleware on /api/admin', severity: 'critical' as const },
  { title: 'Unhandled rejection in checkout flow', severity: 'high' as const },
  { title: 'Memory leak in WebSocket handler', severity: 'high' as const },
  { title: 'Deprecated crypto.createCipher usage', severity: 'medium' as const },
];

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-error/15 text-error border-error/30',
  high: 'bg-spectrum-orange/15 text-spectrum-orange border-spectrum-orange/30',
  medium: 'bg-mc-amber/15 text-mc-amber border-mc-amber/30',
};

function MiniScan() {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount >= SCAN_ISSUES.length) {
      const timer = setTimeout(() => setVisibleCount(0), 3000);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setVisibleCount((c) => c + 1), 1200);
    return () => clearTimeout(timer);
  }, [visibleCount]);

  return (
    <div className="w-full border border-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-spectrum-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="text-xs font-sans font-semibold text-ink">Issue Scanner</span>
        </div>
        {visibleCount > 0 && visibleCount < SCAN_ISSUES.length && (
          <span className="text-[10px] text-accent flex items-center gap-1">
            <div className="w-3 h-3 border-2 border-accent border-t-transparent animate-spin" />
            Scanning...
          </span>
        )}
        {visibleCount >= SCAN_ISSUES.length && (
          <span className="text-[10px] text-success font-medium">
            {SCAN_ISSUES.length} issues found
          </span>
        )}
      </div>

      {/* Issues list */}
      <div className="p-2 space-y-1.5 h-[160px] overflow-hidden">
        {SCAN_ISSUES.slice(0, visibleCount).map((issue, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-2.5 py-1.5 bg-surface-card border border-border animate-in fade-in slide-in-from-bottom-1"
          >
            <span className={`text-[9px] font-medium px-1.5 py-0.5 border flex-shrink-0 uppercase tracking-wider ${SEVERITY_STYLES[issue.severity]}`}>
              {issue.severity}
            </span>
            <span className="text-[10px] text-ink truncate">{issue.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Panel 3: Animated Sprint Planning ───────────────────────────────

const PLAN_ITEMS = [
  { title: 'Fix SQL injection vulnerability', effort: 'Quick Fix' },
  { title: 'Add auth middleware to admin routes', effort: 'Quick Fix' },
  { title: 'Handle checkout promise rejections', effort: 'Moderate' },
  { title: 'Fix WebSocket memory leak', effort: 'Moderate' },
];

function MiniPlan() {
  const [plannedCount, setPlannedCount] = useState(0);

  useEffect(() => {
    if (plannedCount >= PLAN_ITEMS.length) {
      const timer = setTimeout(() => setPlannedCount(0), 3000);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setPlannedCount((c) => c + 1), 1800);
    return () => clearTimeout(timer);
  }, [plannedCount]);

  return (
    <div className="w-full border border-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <span className="text-xs font-sans font-semibold text-ink">Sprint Planning</span>
        </div>
        <span className="text-[10px] text-ink-muted">Sprint 1</span>
      </div>

      {/* Items */}
      <div className="p-2 space-y-1.5 h-[160px] overflow-hidden">
        {PLAN_ITEMS.map((item, i) => {
          const isPlanned = i < plannedCount;
          const isPlanning = i === plannedCount && plannedCount < PLAN_ITEMS.length;

          return (
            <div
              key={i}
              className={`flex items-center justify-between px-2.5 py-2 border transition-all duration-500 ${
                isPlanned
                  ? 'bg-success/5 border-success/20'
                  : 'bg-surface-card border-border'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {isPlanned ? (
                  <svg className="w-3.5 h-3.5 text-success flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : isPlanning ? (
                  <div className="w-3.5 h-3.5 border-2 border-accent border-t-transparent animate-spin flex-shrink-0" />
                ) : (
                  <div className="w-3.5 h-3.5 border border-border flex-shrink-0" />
                )}
                <span className={`text-[10px] truncate ${isPlanned ? 'text-ink-muted' : 'text-ink'}`}>
                  {item.title}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className="text-[9px] text-ink-muted">{item.effort}</span>
                {isPlanned && (
                  <span className="text-[9px] font-medium px-1.5 py-0.5 bg-accent/15 text-accent animate-in fade-in">
                    Sprint 1
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Panel 4: Animated PR Review ──────────────────────────────────────

const PR_STEPS = [
  { status: 'open' as const, label: 'Open', reviewText: 'Waiting for review...' },
  { status: 'reviewing' as const, label: 'In Review', reviewText: 'Reviewing changes...' },
  { status: 'changes' as const, label: 'Changes Requested', reviewText: 'Auto-fixing 2 issues...' },
  { status: 'approved' as const, label: 'Approved', reviewText: 'All checks passed!' },
  { status: 'merged' as const, label: 'Merged', reviewText: 'Merged into main' },
];

const PR_FILES = [
  { name: 'src/api/users.ts', additions: 12, deletions: 8 },
  { name: 'src/middleware/auth.ts', additions: 34, deletions: 0 },
  { name: 'src/services/checkout.ts', additions: 18, deletions: 5 },
];

function MiniPR() {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (stepIdx >= PR_STEPS.length - 1) {
      const timer = setTimeout(() => setStepIdx(0), 2500);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setStepIdx((s) => s + 1), 2000);
    return () => clearTimeout(timer);
  }, [stepIdx]);

  const step = PR_STEPS[stepIdx];
  const isMerged = step.status === 'merged';
  const isApproved = step.status === 'approved' || isMerged;

  const statusColors: Record<string, string> = {
    open: 'bg-accent/15 text-accent border-accent/30',
    reviewing: 'bg-accent/15 text-accent border-accent/30',
    changes: 'bg-mc-amber/15 text-mc-amber border-mc-amber/30',
    approved: 'bg-success/15 text-success border-success/30',
    merged: 'bg-spectrum-purple/15 text-spectrum-purple border-spectrum-purple/30',
  };

  return (
    <div className="w-full border border-border bg-surface overflow-hidden">
      {/* PR header */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-ink-secondary" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            <span className="text-xs font-sans font-semibold text-ink">fix: patch security vulnerabilities</span>
          </div>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 border ${statusColors[step.status]} transition-all duration-300`}>
            {step.label}
          </span>
        </div>
        <span className="text-[10px] text-ink-muted">#42 opened by Assistant</span>
      </div>

      {/* PR body */}
      <div className="p-3 h-[130px] overflow-hidden">
        {/* File list */}
        <div className="space-y-1 mb-3">
          {PR_FILES.map((file) => (
            <div key={file.name} className="flex items-center justify-between text-[10px]">
              <span className="text-ink font-mono truncate">{file.name}</span>
              <span className="flex-shrink-0 ml-2">
                <span className="text-success">+{file.additions}</span>
                {file.deletions > 0 && <span className="text-error ml-1">-{file.deletions}</span>}
              </span>
            </div>
          ))}
        </div>

        {/* Review status */}
        <div className={`flex items-center gap-1.5 text-[10px] transition-all duration-300 ${
          isApproved ? 'text-success' : step.status === 'changes' ? 'text-mc-amber' : 'text-accent'
        }`}>
          {isMerged ? (
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          ) : isApproved ? (
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          ) : (
            <div className="w-3 h-3 border-2 border-current border-t-transparent animate-spin" />
          )}
          {step.reviewText}
        </div>
      </div>
    </div>
  );
}

// ─── Carousel ─────────────────────────────────────────────────────────

const PANELS = [
  { label: 'Import', component: MiniImport },
  { label: 'Scan', component: MiniScan },
  { label: 'Plan', component: MiniPlan },
  { label: 'Ship', component: MiniPR },
];

const AUTO_ADVANCE_MS = 6000;

export default function StageIntro({ onComplete }: StageIntroProps) {
  const [activePanel, setActivePanel] = useState(0);

  // Auto-advance
  useEffect(() => {
    const timer = setTimeout(() => {
      setActivePanel((p) => (p + 1) % PANELS.length);
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [activePanel]);

  const handleDotClick = useCallback((idx: number) => {
    setActivePanel(idx);
  }, []);

  const ActiveComponent = PANELS[activePanel].component;

  return (
    <div className="max-w-2xl w-full text-center">
      {/* Assistant avatar */}
      <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-accent mx-auto mb-5">
        <img src={mcAvatar} alt="Assistant" className="w-full h-full object-cover scale-[1.3] translate-y-[15%]" />
      </div>

      <h1 className="text-3xl font-sans font-bold text-ink mb-2">Mission Control</h1>
      <p className="text-ink-muted text-base mb-6">
        AI-powered dev tool for your codebase
      </p>

      {/* Carousel panel */}
      <div className="mb-4 px-4">
        <div className="transition-opacity duration-300">
          <ActiveComponent />
        </div>
      </div>

      {/* Carousel dots with labels */}
      <div className="flex items-center justify-center gap-4 mb-8">
        {PANELS.map((panel, i) => (
          <button
            key={panel.label}
            onClick={() => handleDotClick(i)}
            className={`flex items-center gap-1.5 px-2 py-1 transition-all duration-200 ${
              i === activePanel ? 'text-accent' : 'text-ink-muted hover:text-ink-secondary'
            }`}
          >
            <div className={`w-2 h-2 transition-all duration-200 ${
              i === activePanel ? 'bg-accent scale-110' : 'bg-border'
            }`} />
            <span className="text-xs font-sans font-medium">{panel.label}</span>
          </button>
        ))}
      </div>

      <button onClick={onComplete} className="btn-solid-primary px-10 py-3 text-base font-medium">
        GET STARTED
      </button>
    </div>
  );
}
