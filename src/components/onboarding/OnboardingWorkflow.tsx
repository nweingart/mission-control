import { useState, useCallback } from 'react';

interface OnboardingWorkflowProps {
  onNext: () => void;
  onBack: () => void;
}

const STAGES = [
  {
    title: 'Describe Your Idea',
    subtitle: 'Step 1 — Idea',
    description: 'Just type what you want to build. No specs, no wireframes needed.',
    mockup: 'idea',
  },
  {
    title: 'Refine with Claude',
    subtitle: 'Step 2 — Discovery',
    description: 'Chat back and forth to nail down the details and scope.',
    mockup: 'discovery',
  },
  {
    title: 'Review Requirements',
    subtitle: 'Step 3 — PRD Review',
    description: 'Claude generates a full product requirements doc. You approve it.',
    mockup: 'prd',
  },
  {
    title: 'Plan the Build',
    subtitle: 'Step 4 — Planning',
    description: 'An ordered task list is generated automatically from the PRD.',
    mockup: 'planning',
  },
  {
    title: 'Claude Writes Code',
    subtitle: 'Step 5 — Building',
    description: 'Each task is built, committed, and code-reviewed one by one.',
    mockup: 'building',
  },
  {
    title: 'Preview Locally',
    subtitle: 'Step 6 — Preview',
    description: 'Your app runs locally so you can test before going live.',
    mockup: 'preview',
  },
  {
    title: 'Deploy Live',
    subtitle: 'Step 7 — Deploy',
    description: 'Push to GitHub and deploy to Vercel in one click.',
    mockup: 'deploy',
  },
];

// --- Mini UI mockups built with Tailwind ---

function MockupIdea() {
  return (
    <div className="card-panel p-5 space-y-4">
      <div className="text-sm font-sans font-medium text-ink-muted">Your Idea</div>
      <div className="bg-surface p-4 border-2 border-border">
        <div className="text-sm text-ink leading-relaxed">
          A habit tracker app where users can set daily goals, track streaks, and see progress charts.
          It should have user auth and a clean, minimal UI...
        </div>
        <div className="animate-pulse inline-block w-0.5 h-5 bg-accent ml-0.5 -mb-0.5" />
      </div>
      <div className="flex items-center justify-between">
        <div className="bg-surface px-4 py-2 text-sm text-ink-muted border-2 border-border">
          Project Name: <span className="text-ink">habit-tracker</span>
        </div>
        <div className="btn-solid-primary text-[13px] px-4 py-2">START BUILDING</div>
      </div>
    </div>
  );
}

function MockupDiscovery() {
  return (
    <div className="card-panel p-5 space-y-3">
      <div className="flex justify-end">
        <div className="bg-accent/15 text-accent text-sm px-4 py-2.5 max-w-[75%]">
          I want it to have streak tracking with a calendar view
        </div>
      </div>
      <div className="flex justify-start">
        <div className="bg-surface text-ink text-sm px-4 py-2.5 max-w-[75%] border-2 border-border">
          Great idea! Should streaks reset if you miss a day, or allow a "grace day" to keep motivation up?
        </div>
      </div>
      <div className="flex justify-end">
        <div className="bg-accent/15 text-accent text-sm px-4 py-2.5 max-w-[75%]">
          Grace day sounds good — let's allow 1 skip per week
        </div>
      </div>
      <div className="flex justify-start">
        <div className="bg-surface text-ink text-sm px-4 py-2.5 max-w-[75%] border-2 border-border">
          <div className="flex items-center space-x-1.5">
            <div className="w-1.5 h-1.5 bg-ink-muted/30 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 bg-ink-muted/30 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 bg-ink-muted/30 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MockupPRD() {
  return (
    <div className="card-panel p-5 space-y-3">
      <div className="flex items-center space-x-2.5 mb-2">
        <div className="w-6 h-6 bg-accent/20 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        </div>
        <span className="text-sm font-medium text-ink">Product Requirements Document</span>
      </div>
      {[
        { label: 'Overview', text: 'A habit tracking application with daily goals...' },
        { label: 'User Stories', text: 'As a user, I can create habits with custom...' },
        { label: 'Tech Stack', text: 'Next.js 14, Supabase Auth, Tailwind CSS...' },
        { label: 'Data Model', text: 'Users → Habits → DailyEntries → Streaks' },
      ].map((section) => (
        <div key={section.label} className="bg-surface px-4 py-2.5 border-2 border-border">
          <div className="text-xs font-sans font-medium text-accent">{section.label}</div>
          <div className="text-sm text-ink-secondary mt-1">{section.text}</div>
        </div>
      ))}
    </div>
  );
}

function MockupPlanning() {
  const tasks = [
    { done: true, text: 'Set up Next.js project with Tailwind' },
    { done: true, text: 'Configure Supabase auth' },
    { done: false, text: 'Create habit CRUD API routes' },
    { done: false, text: 'Build streak tracking logic' },
    { done: false, text: 'Add calendar view component' },
  ];
  return (
    <div className="card-panel p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-sans font-medium text-ink">Task Breakdown</span>
        <span className="text-xs text-ink-muted">2/5 complete</span>
      </div>
      <div className="space-y-2">
        {tasks.map((t, i) => (
          <div key={i} className={`flex items-center space-x-3 px-3.5 py-2.5 text-sm ${t.done ? 'bg-success/10 border-2 border-success/20' : 'bg-surface border-2 border-border'}`}>
            <div className={`w-5 h-5 border-2 flex items-center justify-center flex-shrink-0 ${t.done ? 'bg-success border-success' : 'border-border'}`}>
              {t.done && <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
            </div>
            <span className={t.done ? 'text-ink-muted line-through' : 'text-ink'}>{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockupBuilding() {
  return (
    <div className="card-panel p-5 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-ink">Building: Create habit CRUD API routes</span>
        <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium bg-accent/15 text-accent">
          <div className="w-3 h-3 border-2 border-accent border-t-transparent animate-spin mr-1.5" />
          In progress
        </span>
      </div>
      <div className="bg-surface-light p-3.5 font-mono text-sm leading-relaxed border-2 border-border">
        <div><span className="text-success">+</span> <span className="text-ink-muted">app/api/habits/route.ts</span></div>
        <div><span className="text-success">+</span> <span className="text-ink-muted">app/api/habits/[id]/route.ts</span></div>
        <div><span className="text-success">+</span> <span className="text-ink-muted">lib/habits.ts</span></div>
        <div className="mt-2 text-ink-muted">3 files changed, 147 insertions(+)</div>
      </div>
      <div className="flex items-center space-x-2">
        <div className="w-2.5 h-2.5 bg-success" />
        <span className="text-xs text-ink-muted">Code review passed — auto-merging to main</span>
      </div>
    </div>
  );
}

function MockupPreview() {
  return (
    <div className="card-panel p-5 space-y-3">
      <div className="bg-surface-light overflow-hidden border-2 border-border">
        {/* Browser chrome */}
        <div className="bg-surface px-4 py-2 flex items-center space-x-3 border-b-2 border-border">
          <div className="flex space-x-1.5">
            <div className="w-2.5 h-2.5 bg-spectrum-red/60" />
            <div className="w-2.5 h-2.5 bg-spectrum-yellow/60" />
            <div className="w-2.5 h-2.5 bg-spectrum-green/60" />
          </div>
          <div className="flex-1 bg-surface-card px-3 py-1 text-xs text-ink-muted text-center border border-border">
            localhost:3000
          </div>
        </div>
        {/* App preview */}
        <div className="p-4 space-y-3">
          <div className="text-sm font-sans font-medium text-ink">My Habits</div>
          <div className="flex space-x-3">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
              <div key={d} className="flex flex-col items-center">
                <div className={`w-7 h-7 flex items-center justify-center text-xs ${i < 4 ? 'bg-success text-white' : 'bg-surface text-ink-muted border border-border'}`}>
                  {i < 4 && <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                </div>
                <span className="text-[13px] text-ink-muted mt-1">{d}</span>
              </div>
            ))}
          </div>
          <div className="bg-surface px-3 py-2 text-xs text-success border-2 border-border">
            4-day streak! Keep it up
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <div className="w-2.5 h-2.5 bg-success" />
        <span className="text-xs text-ink-muted">Dev server running on port 3000</span>
      </div>
    </div>
  );
}

function MockupDeploy() {
  return (
    <div className="card-panel p-5 space-y-4">
      <div className="flex items-center justify-center">
        <div className="w-16 h-16 bg-success/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>
      <div className="text-center">
        <div className="text-base font-sans font-semibold text-ink">Deployed!</div>
      </div>
      <div className="space-y-2">
        <div className="bg-surface px-4 py-2.5 flex items-center justify-between border-2 border-border">
          <span className="text-xs text-ink-muted">GitHub</span>
          <span className="text-xs text-success">github.com/you/habit-tracker</span>
        </div>
        <div className="bg-surface px-4 py-2.5 flex items-center justify-between border-2 border-border">
          <span className="text-xs text-ink-muted">Live URL</span>
          <span className="text-xs text-success">habit-tracker.vercel.app</span>
        </div>
      </div>
    </div>
  );
}

const MOCKUP_MAP: Record<string, () => JSX.Element> = {
  idea: MockupIdea,
  discovery: MockupDiscovery,
  prd: MockupPRD,
  planning: MockupPlanning,
  building: MockupBuilding,
  preview: MockupPreview,
  deploy: MockupDeploy,
};

export default function OnboardingWorkflow({ onNext, onBack }: OnboardingWorkflowProps) {
  const [active, setActive] = useState(0);

  const goTo = useCallback((index: number) => {
    setActive(index);
  }, []);

  const handleNext = () => {
    if (active < STAGES.length - 1) {
      setActive(active + 1);
    } else {
      onNext();
    }
  };

  const handleBack = () => {
    if (active > 0) {
      setActive(active - 1);
    } else {
      onBack();
    }
  };

  const stage = STAGES[active];
  const Mockup = MOCKUP_MAP[stage.mockup];

  return (
    <div className="max-w-2xl w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-sans font-bold text-ink mb-2">How It Works</h2>
        <p className="text-ink-muted text-sm">7 stages from idea to live app</p>
      </div>

      {/* Stage nav dots — square */}
      <div className="flex items-center justify-center space-x-2.5 mb-8">
        {STAGES.map((s, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`h-2.5 transition-all duration-300 ${
              i === active ? 'w-8 bg-accent' : 'w-2.5 bg-border hover:bg-ink-muted/20'
            }`}
          />
        ))}
      </div>

      {/* Current stage */}
      <div className="mb-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 bg-accent/20 text-accent flex items-center justify-center font-display text-sm">
            {active + 1}
          </div>
          <div>
            <div className="text-sm font-sans font-medium text-ink">{stage.title}</div>
            <div className="text-sm text-ink-muted">{stage.subtitle}</div>
          </div>
        </div>
        <p className="text-sm text-ink-muted mb-5">{stage.description}</p>

        {/* Mockup */}
        <div className="card-panel p-5">
          <Mockup />
        </div>
      </div>

      {/* Progress bar — segmented */}
      <div className="flex gap-1 mb-8">
        {STAGES.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 ${i <= active ? 'bg-accent' : 'bg-border'}`}
          />
        ))}
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <button
          onClick={handleBack}
          className="btn-solid flex items-center space-x-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>BACK</span>
        </button>
        <button
          onClick={handleNext}
          className="btn-solid-primary flex items-center space-x-2"
        >
          <span>{active < STAGES.length - 1 ? 'NEXT' : 'CONTINUE'}</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
