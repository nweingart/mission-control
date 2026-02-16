import { useState, useEffect, useCallback } from 'react';
import houstonAvatar from '../../assets/houston-avatar.webp';

interface StageIntroProps {
  onComplete: () => void;
}

// ─── Panel 1: Animated Chat ───────────────────────────────────────────

const CHAT_MESSAGES = [
  { role: 'user' as const, text: 'I want to build a habit tracker app' },
  { role: 'assistant' as const, text: 'Great idea! What kind of habits do you want to track — daily routines, fitness goals, or something else?' },
  { role: 'user' as const, text: 'Daily routines, with streaks and reminders' },
  { role: 'assistant' as const, text: 'Nice. Should it have user accounts, or is this a single-user local app?' },
  { role: 'user' as const, text: 'Single user is fine for now' },
  { role: 'assistant' as const, text: 'Got it. I\'ll put together a PRD with streak tracking, push reminders, and a simple local-first architecture.' },
];

function MiniChat() {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount >= CHAT_MESSAGES.length) return;
    const delay = CHAT_MESSAGES[visibleCount]?.role === 'assistant' ? 1800 : 1200;
    const timer = setTimeout(() => setVisibleCount((c) => c + 1), delay);
    return () => clearTimeout(timer);
  }, [visibleCount]);

  // Reset and loop
  useEffect(() => {
    if (visibleCount < CHAT_MESSAGES.length) return;
    const timer = setTimeout(() => setVisibleCount(0), 3000);
    return () => clearTimeout(timer);
  }, [visibleCount]);

  return (
    <div className="w-full border border-border bg-surface overflow-hidden">
      {/* Chat header */}
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <div className="w-5 h-5 rounded-full overflow-hidden border-2 border-spectrum-blue">
          <img src={houstonAvatar} alt="Houston" className="w-full h-full object-cover scale-[1.3] translate-y-[15%]" />
        </div>
        <span className="text-xs font-sans font-semibold text-ink">Houston</span>
        <span className="text-[10px] text-ink-muted">Discovery</span>
      </div>

      {/* Messages */}
      <div className="p-3 space-y-2 h-[160px] overflow-hidden">
        {CHAT_MESSAGES.slice(0, visibleCount).map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-1`}>
            <div className={`max-w-[80%] px-2.5 py-1.5 text-[11px] leading-relaxed ${
              msg.role === 'user'
                ? 'bg-accent/15 text-accent'
                : 'bg-surface-card text-ink border border-border'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {visibleCount < CHAT_MESSAGES.length && visibleCount > 0 && (
          <div className={`flex ${CHAT_MESSAGES[visibleCount].role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="bg-surface-card text-ink-muted text-[11px] px-2.5 py-1.5 border border-border">
              <div className="flex items-center space-x-1">
                <div className="w-1 h-1 bg-ink-muted/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1 h-1 bg-ink-muted/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1 h-1 bg-ink-muted/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Panel 2: Animated PRD ────────────────────────────────────────────

const PRD_SECTIONS = [
  { title: 'Overview', content: 'A single-user habit tracking app with streak counting and daily reminders.' },
  { title: 'Core Features', content: '• Create/edit/delete habits\n• Daily check-in with streak tracking\n• Push notification reminders\n• Weekly progress summary' },
  { title: 'Tech Stack', content: 'React + TypeScript, local SQLite storage, service worker for notifications.' },
  { title: 'Success Metrics', content: '• 7-day retention > 60%\n• Avg. daily check-ins ≥ 3' },
];

function MiniPRD() {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount >= PRD_SECTIONS.length) return;
    const timer = setTimeout(() => setVisibleCount((c) => c + 1), 1500);
    return () => clearTimeout(timer);
  }, [visibleCount]);

  // Reset and loop
  useEffect(() => {
    if (visibleCount < PRD_SECTIONS.length) return;
    const timer = setTimeout(() => setVisibleCount(0), 3000);
    return () => clearTimeout(timer);
  }, [visibleCount]);

  return (
    <div className="w-full border border-border bg-surface overflow-hidden">
      {/* PRD header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-xs font-sans font-semibold text-ink">Product Requirements</span>
        </div>
        <span className="text-[10px] text-ink-muted">HabitTracker</span>
      </div>

      {/* Sections */}
      <div className="p-3 space-y-3 h-[160px] overflow-hidden">
        {PRD_SECTIONS.slice(0, visibleCount).map((section, i) => (
          <div key={i} className="animate-in fade-in slide-in-from-bottom-1">
            <h4 className="text-[11px] font-sans font-semibold text-accent mb-0.5">{section.title}</h4>
            <p className="text-[10px] text-ink-muted leading-relaxed whitespace-pre-line">{section.content}</p>
          </div>
        ))}
        {visibleCount < PRD_SECTIONS.length && (
          <div className="flex items-center gap-1.5 text-[10px] text-accent">
            <div className="w-3 h-3 border-2 border-accent border-t-transparent animate-spin" />
            Generating...
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Panel 3: Animated Kanban ─────────────────────────────────────────

const DEMO_TASKS = [
  'Set up authentication',
  'Create landing page',
  'Build user dashboard',
  'Add payment integration',
  'Design settings page',
];

interface AnimatedCard {
  id: number;
  title: string;
  column: 'todo' | 'in-progress' | 'done';
}

function MiniKanban() {
  const [cards, setCards] = useState<AnimatedCard[]>([
    { id: 0, title: DEMO_TASKS[0], column: 'todo' },
    { id: 1, title: DEMO_TASKS[1], column: 'todo' },
    { id: 2, title: DEMO_TASKS[2], column: 'todo' },
  ]);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setCycle((c) => c + 1), 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (cycle === 0) return;

    setCards((prev) => {
      const next = [...prev];

      const inProgressIdx = next.findIndex((c) => c.column === 'in-progress');
      if (inProgressIdx !== -1) {
        next[inProgressIdx] = { ...next[inProgressIdx], column: 'done' };
      }

      const todoIdx = next.findIndex((c) => c.column === 'todo');
      if (todoIdx !== -1) {
        next[todoIdx] = { ...next[todoIdx], column: 'in-progress' };
      }

      const todoCount = next.filter((c) => c.column === 'todo').length;
      if (todoCount <= 1) {
        const usedTitles = new Set(next.map((c) => c.title));
        const available = DEMO_TASKS.find((t) => !usedTitles.has(t));
        if (available) {
          next.push({ id: Date.now(), title: available, column: 'todo' });
        }
      }

      const doneCards = next.filter((c) => c.column === 'done');
      if (doneCards.length > 2) {
        const removeIdx = next.findIndex((c) => c.id === doneCards[0].id);
        if (removeIdx !== -1) next.splice(removeIdx, 1);
      }

      return next;
    });
  }, [cycle]);

  const columns = [
    { id: 'todo' as const, title: 'To Do', color: 'text-ink-secondary', borderColor: 'border-border', bgColor: 'bg-surface' },
    { id: 'in-progress' as const, title: 'In Progress', color: 'text-spectrum-blue', borderColor: 'border-spectrum-blue/30', bgColor: 'bg-spectrum-blue/10' },
    { id: 'done' as const, title: 'Done', color: 'text-success', borderColor: 'border-success/30', bgColor: 'bg-success/10' },
  ];

  return (
    <div className="flex gap-2 w-full">
      {columns.map((col) => {
        const colCards = cards.filter((c) => c.column === col.id);
        return (
          <div key={col.id} className={`flex-1 border ${col.borderColor} ${col.bgColor} min-h-[140px]`}>
            <div className={`px-2 py-1.5 border-b ${col.borderColor}`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-[10px] font-sans font-semibold ${col.color}`}>{col.title}</h3>
                <span className={`text-[9px] font-display px-1 py-0.5 ${col.bgColor} ${col.color}`}>
                  {colCards.length}
                </span>
              </div>
            </div>
            <div className="p-1.5 space-y-1.5">
              {colCards.map((card) => (
                <div key={card.id} className="bg-surface-card border border-border p-1.5 transition-all duration-500 animate-in fade-in slide-in-from-left-2">
                  <div className="flex items-start gap-1.5">
                    {col.id === 'done' ? (
                      <svg className="w-3 h-3 text-success flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    ) : col.id === 'in-progress' ? (
                      <div className="w-3 h-3 border-2 border-spectrum-blue border-t-transparent animate-spin flex-shrink-0 mt-0.5" />
                    ) : (
                      <div className="w-3 h-3 border border-border flex-shrink-0 mt-0.5" />
                    )}
                    <span className={`text-[10px] leading-tight ${col.id === 'done' ? 'text-ink-muted line-through' : 'text-ink'}`}>
                      {card.title}
                    </span>
                  </div>
                  {col.id === 'in-progress' && (
                    <div className="mt-1 flex items-center gap-1 text-[9px] text-spectrum-blue">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full bg-spectrum-blue opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 bg-spectrum-blue" />
                      </span>
                      Building...
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Panel 4: Animated PR Review ──────────────────────────────────────

const PR_STEPS = [
  { status: 'open' as const, label: 'Open', reviewText: 'Waiting for review...' },
  { status: 'reviewing' as const, label: 'In Review', reviewText: 'Houston is reviewing changes...' },
  { status: 'changes' as const, label: 'Changes Requested', reviewText: 'Auto-fixing 2 issues...' },
  { status: 'approved' as const, label: 'Approved', reviewText: 'All checks passed!' },
  { status: 'merged' as const, label: 'Merged', reviewText: 'Merged into main' },
];

const PR_FILES = [
  { name: 'src/components/HabitCard.tsx', additions: 45, deletions: 0 },
  { name: 'src/hooks/useStreaks.ts', additions: 28, deletions: 3 },
  { name: 'src/screens/Dashboard.tsx', additions: 62, deletions: 12 },
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
    open: 'bg-spectrum-blue/15 text-spectrum-blue border-spectrum-blue/30',
    reviewing: 'bg-accent/15 text-accent border-accent/30',
    changes: 'bg-houston-amber/15 text-houston-amber border-houston-amber/30',
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
            <span className="text-xs font-sans font-semibold text-ink">feat: add habit tracking</span>
          </div>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 border ${statusColors[step.status]} transition-all duration-300`}>
            {step.label}
          </span>
        </div>
        <span className="text-[10px] text-ink-muted">#42 opened by Houston</span>
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
          isApproved ? 'text-success' : step.status === 'changes' ? 'text-houston-amber' : 'text-accent'
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
  { label: 'Discovery', component: MiniChat },
  { label: 'PRD', component: MiniPRD },
  { label: 'Build', component: MiniKanban },
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
      {/* Houston avatar */}
      <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-accent mx-auto mb-5">
        <img src={houstonAvatar} alt="Houston" className="w-full h-full object-cover scale-[1.3] translate-y-[15%]" />
      </div>

      <h1 className="text-3xl font-sans font-bold text-ink mb-2">Houston</h1>
      <p className="text-ink-muted text-base mb-6">
        Your mission control for building & shipping apps
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
