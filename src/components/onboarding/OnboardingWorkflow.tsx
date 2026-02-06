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
    <div className="bg-charcoal-800 rounded-lg p-4 space-y-3">
      <div className="text-xs text-charcoal-400 font-medium uppercase tracking-wider">Your Idea</div>
      <div className="bg-charcoal-700 rounded-lg p-3 border border-charcoal-600">
        <div className="text-sm text-cream-100 leading-relaxed">
          A habit tracker app where users can set daily goals, track streaks, and see progress charts.
          It should have user auth and a clean, minimal UI...
        </div>
        <div className="animate-pulse inline-block w-0.5 h-4 bg-terracotta-500 ml-0.5 -mb-0.5" />
      </div>
      <div className="flex items-center justify-between">
        <div className="bg-charcoal-700 rounded px-3 py-1.5 text-xs text-charcoal-300 border border-charcoal-600">
          Project Name: <span className="text-cream-100">habit-tracker</span>
        </div>
        <div className="bg-terracotta-500 text-charcoal-950 text-xs font-medium rounded px-3 py-1.5">Start Building</div>
      </div>
    </div>
  );
}

function MockupDiscovery() {
  return (
    <div className="bg-charcoal-800 rounded-lg p-4 space-y-2.5">
      <div className="flex justify-end">
        <div className="bg-terracotta-500/15 text-terracotta-200 text-xs rounded-lg px-3 py-2 max-w-[75%]">
          I want it to have streak tracking with a calendar view
        </div>
      </div>
      <div className="flex justify-start">
        <div className="bg-charcoal-700 text-charcoal-100 text-xs rounded-lg px-3 py-2 max-w-[75%] border border-charcoal-600">
          Great idea! Should streaks reset if you miss a day, or allow a "grace day" to keep motivation up?
        </div>
      </div>
      <div className="flex justify-end">
        <div className="bg-terracotta-500/15 text-terracotta-200 text-xs rounded-lg px-3 py-2 max-w-[75%]">
          Grace day sounds good — let's allow 1 skip per week
        </div>
      </div>
      <div className="flex justify-start">
        <div className="bg-charcoal-700 text-charcoal-100 text-xs rounded-lg px-3 py-2 max-w-[75%] border border-charcoal-600">
          <div className="flex items-center space-x-1">
            <div className="w-1 h-1 bg-charcoal-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1 h-1 bg-charcoal-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1 h-1 bg-charcoal-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MockupPRD() {
  return (
    <div className="bg-charcoal-800 rounded-lg p-4 space-y-2">
      <div className="flex items-center space-x-2 mb-1">
        <div className="w-4 h-4 rounded bg-terracotta-500/20 flex items-center justify-center">
          <svg className="w-2.5 h-2.5 text-terracotta-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        </div>
        <span className="text-xs font-medium text-cream-100">Product Requirements Document</span>
      </div>
      {[
        { label: 'Overview', text: 'A habit tracking application with daily goals...' },
        { label: 'User Stories', text: 'As a user, I can create habits with custom...' },
        { label: 'Tech Stack', text: 'Next.js 14, Supabase Auth, Tailwind CSS...' },
        { label: 'Data Model', text: 'Users → Habits → DailyEntries → Streaks' },
      ].map((section) => (
        <div key={section.label} className="bg-charcoal-700 rounded px-3 py-2 border border-charcoal-600">
          <div className="text-[10px] text-terracotta-500 font-semibold uppercase tracking-wider">{section.label}</div>
          <div className="text-xs text-charcoal-200 mt-0.5">{section.text}</div>
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
    <div className="bg-charcoal-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-cream-100">Task Breakdown</span>
        <span className="text-[10px] text-charcoal-400">2/5 complete</span>
      </div>
      <div className="space-y-1.5">
        {tasks.map((t, i) => (
          <div key={i} className={`flex items-center space-x-2 rounded px-2.5 py-1.5 text-xs ${t.done ? 'bg-sage-500/10 border border-sage-500/20' : 'bg-charcoal-700 border border-charcoal-600'}`}>
            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${t.done ? 'bg-sage-500 border-sage-500' : 'border-charcoal-400'}`}>
              {t.done && <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
            </div>
            <span className={t.done ? 'text-charcoal-400 line-through' : 'text-charcoal-100'}>{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockupBuilding() {
  return (
    <div className="bg-charcoal-800 rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-cream-100">Building: Create habit CRUD API routes</span>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-terracotta-500/15 text-terracotta-400">
          <svg className="animate-spin h-2.5 w-2.5 mr-1" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          In progress
        </span>
      </div>
      <div className="bg-charcoal-950 rounded p-2.5 font-mono text-[11px] leading-relaxed">
        <div><span className="text-sage-400">+</span> <span className="text-charcoal-300">app/api/habits/route.ts</span></div>
        <div><span className="text-sage-400">+</span> <span className="text-charcoal-300">app/api/habits/[id]/route.ts</span></div>
        <div><span className="text-sage-400">+</span> <span className="text-charcoal-300">lib/habits.ts</span></div>
        <div className="mt-1.5 text-charcoal-400">3 files changed, 147 insertions(+)</div>
      </div>
      <div className="flex items-center space-x-1.5">
        <div className="w-2 h-2 rounded-full bg-sage-500" />
        <span className="text-[10px] text-charcoal-300">Code review passed — auto-merging to main</span>
      </div>
    </div>
  );
}

function MockupPreview() {
  return (
    <div className="bg-charcoal-800 rounded-lg p-4 space-y-2">
      <div className="bg-charcoal-950 rounded-lg overflow-hidden border border-charcoal-600">
        {/* Browser chrome */}
        <div className="bg-charcoal-900 px-3 py-1.5 flex items-center space-x-2">
          <div className="flex space-x-1">
            <div className="w-2 h-2 rounded-full bg-red-500/60" />
            <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
            <div className="w-2 h-2 rounded-full bg-green-500/60" />
          </div>
          <div className="flex-1 bg-charcoal-800 rounded px-2 py-0.5 text-[10px] text-charcoal-400 text-center">
            localhost:3000
          </div>
        </div>
        {/* App preview */}
        <div className="p-3 space-y-2">
          <div className="text-xs font-semibold text-cream-100">My Habits</div>
          <div className="flex space-x-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
              <div key={d} className="flex flex-col items-center">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] ${i < 4 ? 'bg-sage-500 text-white' : 'bg-charcoal-700 text-charcoal-400'}`}>
                  {i < 4 && <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                </div>
                <span className="text-[8px] text-charcoal-400 mt-0.5">{d}</span>
              </div>
            ))}
          </div>
          <div className="bg-charcoal-700 rounded px-2 py-1 text-[10px] text-sage-400 border border-charcoal-600">
            4-day streak! Keep it up
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-1.5">
        <div className="w-2 h-2 rounded-full bg-sage-500" />
        <span className="text-[10px] text-charcoal-300">Dev server running on port 3000</span>
      </div>
    </div>
  );
}

function MockupDeploy() {
  return (
    <div className="bg-charcoal-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-sage-500/20 flex items-center justify-center">
          <svg className="w-6 h-6 text-sage-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>
      <div className="text-center">
        <div className="text-xs font-semibold text-cream-100">Deployed!</div>
      </div>
      <div className="space-y-1.5">
        <div className="bg-charcoal-700 rounded px-3 py-1.5 flex items-center justify-between border border-charcoal-600">
          <span className="text-[10px] text-charcoal-300">GitHub</span>
          <span className="text-[10px] text-sage-400">github.com/you/habit-tracker</span>
        </div>
        <div className="bg-charcoal-700 rounded px-3 py-1.5 flex items-center justify-between border border-charcoal-600">
          <span className="text-[10px] text-charcoal-300">Live URL</span>
          <span className="text-[10px] text-sage-400">habit-tracker.vercel.app</span>
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
    <div className="max-w-lg w-full">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-cream-100 mb-1">How It Works</h2>
        <p className="text-charcoal-300 text-sm">7 stages from idea to live app</p>
      </div>

      {/* Stage nav dots */}
      <div className="flex items-center justify-center space-x-1.5 mb-5">
        {STAGES.map((s, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === active ? 'w-6 bg-terracotta-500' : 'w-1.5 bg-charcoal-600 hover:bg-charcoal-500'
            }`}
          />
        ))}
      </div>

      {/* Current stage */}
      <div className="mb-4">
        <div className="flex items-center space-x-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-terracotta-500/20 text-terracotta-500 flex items-center justify-center text-xs font-bold">
            {active + 1}
          </div>
          <div>
            <div className="text-sm font-semibold text-cream-100">{stage.title}</div>
            <div className="text-xs text-charcoal-400">{stage.subtitle}</div>
          </div>
        </div>
        <p className="text-sm text-charcoal-300 mb-3">{stage.description}</p>

        {/* Mockup */}
        <div className="bg-charcoal-950 rounded-xl border border-charcoal-600 p-3 shadow-lg shadow-black/30">
          <Mockup />
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-charcoal-700 rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-terracotta-500/50 transition-all duration-300"
          style={{ width: `${((active + 1) / STAGES.length) * 100}%` }}
        />
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <button
          onClick={handleBack}
          className="flex items-center space-x-2 px-4 py-2 text-charcoal-300 hover:text-cream-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>Back</span>
        </button>
        <button
          onClick={handleNext}
          className="flex items-center space-x-2 px-6 py-2 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600 transition-colors font-medium"
        >
          <span>{active < STAGES.length - 1 ? 'Next' : 'Continue'}</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
