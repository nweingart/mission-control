import { useState, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';

type StepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

interface TestStep {
  name: string;
  screen: string;
  run: () => Promise<void>;
}

const TEST_PROJECT = {
  slug: 'flow-test-habit-tracker',
  name: 'Habit Tracker',
  status: 'idea' as const,
  createdAt: new Date().toISOString(),
  projectPath: '/tmp/flow-test/habit-tracker',
  idea: 'A habit tracking app with streak tracking, calendar view, and daily reminders. Users can set goals, track streaks, and see progress charts.',
};

const TEST_PRD = `# Habit Tracker — Product Requirements Document

## Overview
A habit tracking application that helps users build and maintain positive daily habits through streak tracking, calendar visualization, and motivational reminders.

## Tech Stack
- **Framework:** Next.js 14 (App Router)
- **Database:** SQLite / PostgreSQL
- **Styling:** Tailwind CSS
- **Deployment:** GitHub Pages

## User Stories
1. As a user, I can create habits with custom names and daily goals
2. As a user, I can mark habits as complete each day
3. As a user, I can view my streak count for each habit
4. As a user, I can see a calendar view of my habit history
5. As a user, I can set up daily reminders

## Data Model
- **users** — id, email, created_at
- **habits** — id, user_id, name, description, created_at
- **entries** — id, habit_id, date, completed
- **streaks** — id, habit_id, current_count, longest_count`;

const TEST_TASKS = [
  { id: 'task-1', title: 'Set up Next.js 14 project with Tailwind CSS', completed: false },
  { id: 'task-2', title: 'Configure database and auth schema', completed: false },
  { id: 'task-3', title: 'Create habit CRUD API routes', completed: false },
  { id: 'task-4', title: 'Build streak tracking logic', completed: false },
  { id: 'task-5', title: 'Add calendar view component', completed: false },
  { id: 'task-6', title: 'Implement daily reminders', completed: false },
];

const TEST_CHAT_MESSAGES = [
  { id: 'msg-1', role: 'user' as const, content: 'I want to build a habit tracking app with streak tracking and a calendar view', timestamp: new Date() },
  { id: 'msg-2', role: 'assistant' as const, content: 'Great idea! A few questions to scope this out:\n\n1. Should users be able to set different frequencies (daily, weekly, custom)?\n2. Do you want social features like sharing streaks?\n3. Should there be notifications/reminders?', timestamp: new Date() },
  { id: 'msg-3', role: 'user' as const, content: 'Daily only for now, no social features, but yes to reminders. I want a clean minimal UI.', timestamp: new Date() },
  { id: 'msg-4', role: 'assistant' as const, content: 'Perfect — keeping it focused. I\'ll design it with:\n\n- **Daily habits only** (simple toggle per day)\n- **Streak counter** with grace day support (1 skip/week)\n- **Calendar heatmap** showing completion history\n- **Push reminders** at user-configured times\n- **Minimal UI** using Tailwind with a clean card-based layout\n\nReady to generate the full PRD?', timestamp: new Date() },
  { id: 'msg-5', role: 'user' as const, content: 'Yes, generate the PRD!', timestamp: new Date() },
];

// V2 Planning test data
const TEST_PLANNING_CHAT = {
  id: 'planning-chat-1',
  title: 'V2 Feature Planning',
  messages: [
    { id: 'plan-msg-1', role: 'user' as const, content: 'What V2 features should we plan for this habit tracker?', timestamp: new Date() },
    { id: 'plan-msg-2', role: 'assistant' as const, content: 'Based on the MVP, here are some great V2 features to consider:\n\n**Add to backlog?**\nTitle: Social Sharing\nDescription: Allow users to share their streaks and achievements with friends\nPriority: medium\n\n**Add to backlog?**\nTitle: Weekly/Custom Frequencies\nDescription: Support habits that repeat weekly or on custom schedules\nPriority: high\n\n**Add to backlog?**\nTitle: Progress Analytics\nDescription: Charts and insights showing habit completion trends over time\nPriority: medium', timestamp: new Date() },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const TEST_BACKLOG_ITEMS = [
  { id: 'backlog-1', title: 'Social Sharing', description: 'Allow users to share their streaks and achievements with friends', priority: 'medium' as const, createdAt: new Date().toISOString(), chatId: 'planning-chat-1' },
  { id: 'backlog-2', title: 'Weekly/Custom Frequencies', description: 'Support habits that repeat weekly or on custom schedules', priority: 'high' as const, createdAt: new Date().toISOString(), chatId: 'planning-chat-1' },
  { id: 'backlog-3', title: 'Progress Analytics', description: 'Charts and insights showing habit completion trends over time', priority: 'medium' as const, createdAt: new Date().toISOString() },
];

const STEP_DELAY = 2500;

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function FlowTestRunner({ onClose }: { onClose: () => void }) {
  const [isRunning, setIsRunning] = useState(false);
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>([]);
  const [stepDurations, setStepDurations] = useState<number[]>([]);
  const [stepErrors, setStepErrors] = useState<(string | null)[]>([]);
  const [currentStep, setCurrentStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [totalDuration, setTotalDuration] = useState<number | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [copied, setCopied] = useState(false);

  const store = useAppStore;

  const updateStep = useCallback((index: number, status: StepStatus) => {
    setStepStatuses(prev => {
      const next = [...prev];
      next[index] = status;
      return next;
    });
  }, []);

  const steps: TestStep[] = [
    {
      name: 'Idea Screen',
      screen: 'idea',
      run: async () => {
        console.log('[FlowTest:IdeaScreen] Setting screen to idea...');
        store.getState().setScreen('idea');
        store.getState().setCurrentProject(null);
        await delay(STEP_DELAY);
        console.log('[FlowTest:IdeaScreen] Done.');
      },
    },
    {
      name: 'Create Project',
      screen: 'idea',
      run: async () => {
        console.log('[FlowTest:CreateProject] Creating test project...');
        const project = { ...TEST_PROJECT };
        store.getState().setCurrentProject(project as any);
        store.getState().setProjects([project as any]);
        await delay(1500);
        console.log('[FlowTest:CreateProject] Done.');
      },
    },
    {
      name: 'Project Home',
      screen: 'project-home',
      run: async () => {
        console.log('[FlowTest:ProjectHome] Setting screen to project-home...');
        store.getState().setScreen('project-home');
        await delay(STEP_DELAY);
        console.log('[FlowTest:ProjectHome] Done.');
      },
    },
    {
      name: 'Discovery Chat',
      screen: 'discovery',
      run: async () => {
        console.log('[FlowTest:Discovery] Setting chat messages and screen...');
        store.getState().setChatMessages(TEST_CHAT_MESSAGES);
        store.getState().setScreen('discovery');
        await delay(STEP_DELAY);
        console.log('[FlowTest:Discovery] Done.');
      },
    },
    {
      name: 'PRD Review',
      screen: 'prd-review',
      run: async () => {
        console.log('[FlowTest:PRDReview] Setting project with PRD...');
        const project = { ...TEST_PROJECT, status: 'planning' as const, prd: TEST_PRD };
        store.getState().setCurrentProject(project as any);
        store.getState().setScreen('prd-review');
        await delay(STEP_DELAY);
        console.log('[FlowTest:PRDReview] Done.');
      },
    },
    {
      name: 'Task Planning',
      screen: 'planning',
      run: async () => {
        console.log('[FlowTest:Planning] Setting tasks and screen...');
        store.getState().setTasks(TEST_TASKS);
        store.getState().setScreen('planning');
        await delay(STEP_DELAY);
        console.log('[FlowTest:Planning] Done.');
      },
    },
    {
      name: 'Building',
      screen: 'building',
      run: async () => {
        console.log('[FlowTest:Building] Setting tasks in progress...');
        const tasksInProgress = TEST_TASKS.map((t, i) => ({
          ...t,
          completed: i < 2,
        }));
        store.getState().setTasks(tasksInProgress);
        const project = { ...TEST_PROJECT, status: 'building' as const };
        store.getState().setCurrentProject(project as any);
        store.getState().setScreen('building');
        await delay(STEP_DELAY);
        console.log('[FlowTest:Building] Done.');
      },
    },
    {
      name: 'V2 Planning',
      screen: 'building (plan tab)',
      run: async () => {
        console.log('[FlowTest:V2Planning] Setting up planning data...');

        // Set up planning chat
        const state = store.getState();

        // Create a planning chat with test messages
        const chatId = state.createPlanningChat(TEST_PLANNING_CHAT.title);
        console.log('[FlowTest:V2Planning] Created planning chat:', chatId);

        // Add the test messages to the planning chat
        TEST_PLANNING_CHAT.messages.forEach(msg => {
          state.addPlanningMessage({ role: msg.role, content: msg.content });
        });
        console.log('[FlowTest:V2Planning] Added planning messages');

        // Add backlog items
        TEST_BACKLOG_ITEMS.forEach(item => {
          state.addBacklogItem({
            title: item.title,
            description: item.description,
            priority: item.priority,
            chatId: item.chatId,
          });
        });
        console.log('[FlowTest:V2Planning] Added backlog items:', TEST_BACKLOG_ITEMS.length);

        // Verify the data is in the store
        const { backlog, getActivePlanningMessages } = store.getState();
        console.log(`[FlowTest:V2Planning] Store state: ${backlog.length} backlog items, ${getActivePlanningMessages().length} planning messages`);

        // Stay on building screen (the Plan V2 tab is part of BuildScreen)
        await delay(STEP_DELAY);
        console.log('[FlowTest:V2Planning] Done.');
      },
    },
    {
      name: 'Planning Chats',
      screen: 'planning-chats',
      run: async () => {
        console.log('[FlowTest:PlanningChats] Navigating to planning chats screen...');
        store.getState().setScreen('planning-chats');
        await delay(STEP_DELAY);
        console.log('[FlowTest:PlanningChats] Done.');
      },
    },
    {
      name: 'Preview',
      screen: 'previewing',
      run: async () => {
        console.log('[FlowTest:Preview] Setting all tasks done...');
        const allDone = TEST_TASKS.map(t => ({ ...t, completed: true }));
        store.getState().setTasks(allDone);
        const project = { ...TEST_PROJECT, status: 'previewing' as const };
        store.getState().setCurrentProject(project as any);
        store.getState().setScreen('previewing');
        await delay(STEP_DELAY);
        console.log('[FlowTest:Preview] Done.');
      },
    },
    {
      name: 'Deploy',
      screen: 'deploying',
      run: async () => {
        console.log('[FlowTest:Deploy] Setting project with github repo...');
        const project = {
          ...TEST_PROJECT,
          status: 'deploying' as const,
          githubRepo: 'https://github.com/testuser/habit-tracker',
        };
        store.getState().setCurrentProject(project as any);
        store.getState().setScreen('deploying');
        await delay(STEP_DELAY);
        console.log('[FlowTest:Deploy] Done.');
      },
    },
    {
      name: 'Complete',
      screen: 'complete',
      run: async () => {
        console.log('[FlowTest:Complete] Setting final project state...');
        const project = {
          ...TEST_PROJECT,
          status: 'complete' as const,
          githubRepo: 'https://github.com/testuser/habit-tracker',
        };
        store.getState().setCurrentProject(project as any);
        store.getState().setScreen('complete');
        await delay(STEP_DELAY);
        console.log('[FlowTest:Complete] Done.');
      },
    },
  ];

  const runTest = async () => {
    console.log('[FlowTest] Starting flow test...');
    const testStart = Date.now();
    setIsRunning(true);
    setError(null);
    setTotalDuration(null);
    setShowReport(false);
    setCopied(false);
    setStepStatuses(steps.map(() => 'pending'));
    setStepDurations(steps.map(() => 0));
    setStepErrors(steps.map(() => null));

    // Enable flow test mode — prevents screens from auto-starting real API work
    console.log('[FlowTest] Enabling flow test mode...');
    store.getState().setFlowTestMode(true);

    try {
      for (let i = 0; i < steps.length; i++) {
        console.log(`[FlowTest] Step ${i + 1}/${steps.length}: "${steps[i].name}" (screen: ${steps[i].screen}) — starting`);
        setCurrentStep(i);
        updateStep(i, 'running');
        const stepStart = Date.now();

        try {
          await steps[i].run();
          const elapsed = Date.now() - stepStart;
          setStepDurations(prev => { const next = [...prev]; next[i] = elapsed; return next; });
          console.log(`[FlowTest] Step ${i + 1}: "${steps[i].name}" — passed (${elapsed}ms)`);
          updateStep(i, 'passed');
        } catch (err) {
          const elapsed = Date.now() - stepStart;
          setStepDurations(prev => { const next = [...prev]; next[i] = elapsed; return next; });
          const message = err instanceof Error ? err.message : String(err);
          setStepErrors(prev => { const next = [...prev]; next[i] = message; return next; });
          console.error(`[FlowTest] Step ${i + 1}: "${steps[i].name}" — FAILED (${elapsed}ms):`, message);
          console.error(`[FlowTest] Stack:`, err instanceof Error ? err.stack : '');
          updateStep(i, 'failed');
          setError(`Step "${steps[i].name}" failed: ${message}`);
          for (let j = i + 1; j < steps.length; j++) {
            updateStep(j, 'skipped');
          }
          break;
        }
      }
    } catch (outerErr) {
      console.error('[FlowTest] Unexpected outer error:', outerErr);
      setError(`Unexpected error: ${outerErr instanceof Error ? outerErr.message : String(outerErr)}`);
    } finally {
      console.log('[FlowTest] Cleaning up...');

      // Reset all project-scoped state and navigate back to home
      await delay(500);
      store.getState().setCurrentProject(null);
      store.getState().setTasks([]);
      store.getState().setChatMessages([]);
      store.getState().clearTerminalOutput();

      // Clear planning data and git events
      store.getState().setActivePlanningChat(null);
      store.setState({ gitEvents: [], backlog: [], sprints: [], planningChats: [], deployments: [], gapAnalyses: [], saveError: null, projectHomeTab: 'plan' as const, planSubTab: 'planning' as const, shipSubTab: 'commits' as const, buildTaskPhase: 'idle' as const, buildCurrentTaskId: null, buildSessionActive: false, gamification: { streakCount: 0, lastActivityDate: null, streakFreezeUsedThisWeek: false, lastFreezeWeek: null, totalTasksLanded: 0, totalLaunches: 0, milestones: [] }, gamificationEvent: null, houstonGreeting: null, houstonApproval: null, houstonErrorContext: null, toasts: [] });

      store.getState().setScreen('home');

      // Restore real projects list from disk
      try {
        await store.getState().refreshProjects();
      } catch (e) {
        console.warn('[FlowTest] Failed to refresh projects:', e);
      }

      // Disable flow test mode
      store.getState().setFlowTestMode(false);

      const elapsed = Date.now() - testStart;
      setTotalDuration(elapsed);
      setCurrentStep(-1);
      setIsRunning(false);
      setShowReport(true);
      console.log(`[FlowTest] Flow test complete in ${elapsed}ms.`);
    }
  };

  const generateReportText = () => {
    const timestamp = new Date().toLocaleString();
    const passed = stepStatuses.filter(s => s === 'passed').length;
    const failed = stepStatuses.filter(s => s === 'failed').length;
    const skipped = stepStatuses.filter(s => s === 'skipped').length;
    const total = steps.length;

    let report = `HOUSTON FLOW TEST REPORT\n`;
    report += `========================\n`;
    report += `Date: ${timestamp}\n`;
    report += `Result: ${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`}\n`;
    report += `Steps: ${passed} passed, ${failed} failed, ${skipped} skipped / ${total} total\n`;
    report += `Duration: ${totalDuration ? (totalDuration / 1000).toFixed(1) : '?'}s\n`;
    report += `\n`;
    report += `STEPS\n`;
    report += `-----\n`;

    steps.forEach((step, i) => {
      const status = stepStatuses[i] || 'pending';
      const icon = status === 'passed' ? 'PASS' : status === 'failed' ? 'FAIL' : status === 'skipped' ? 'SKIP' : '----';
      const duration = stepDurations[i] ? `${(stepDurations[i] / 1000).toFixed(1)}s` : '-';
      report += `  [${icon}] ${step.name} (${step.screen}) — ${duration}\n`;
      if (stepErrors[i]) {
        report += `         Error: ${stepErrors[i]}\n`;
      }
    });

    report += `\nScreens visited: ${steps.map(s => s.screen).join(' → ')}\n`;

    return report;
  };

  const copyReport = async () => {
    const report = generateReportText();
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('[FlowTest] Failed to copy report to clipboard');
    }
  };

  const passedCount = stepStatuses.filter(s => s === 'passed').length;
  const failedCount = stepStatuses.filter(s => s === 'failed').length;
  const skippedCount = stepStatuses.filter(s => s === 'skipped').length;
  const allDone = stepStatuses.length > 0 && stepStatuses.every(s => s !== 'pending' && s !== 'running');

  // Report view (shown after test completes)
  if (showReport && allDone) {
    const allPassed = failedCount === 0;
    return (
      <div className="fixed top-4 right-4 z-[100] w-96">
        <div className="bg-surface border border-border overflow-hidden">
          {/* Report Header */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-sans font-semibold text-ink">Flow Test Report</h3>
              <button
                onClick={onClose}
                className="text-ink-muted hover:text-ink-secondary"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Summary Banner */}
          <div className={`mx-4 mt-3 px-4 py-3 border ${
            allPassed
              ? 'bg-success/10 border-success/30'
              : 'bg-error/10 border-error/30'
          }`}>
            <div className="flex items-center space-x-3">
              {allPassed ? (
                <svg className="w-8 h-8 text-success flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-8 h-8 text-error flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
              <div>
                <p className={`text-sm font-bold ${allPassed ? 'text-success' : 'text-error'}`}>
                  {allPassed ? 'All Steps Passed' : `${failedCount} Step${failedCount > 1 ? 's' : ''} Failed`}
                </p>
                <p className="text-xs text-ink-muted mt-0.5">
                  {passedCount} passed{failedCount > 0 ? `, ${failedCount} failed` : ''}{skippedCount > 0 ? `, ${skippedCount} skipped` : ''} &middot; {totalDuration ? `${(totalDuration / 1000).toFixed(1)}s` : ''}
                </p>
              </div>
            </div>
          </div>

          {/* Step Results */}
          <div className="px-4 py-3 space-y-0.5 max-h-[320px] overflow-y-auto">
            {steps.map((step, i) => {
              const status = stepStatuses[i] || 'pending';
              return (
                <div key={i} className={`px-3 py-2 ${
                  status === 'failed' ? 'bg-error/5' : ''
                }`}>
                  <div className="flex items-center space-x-2.5 text-sm">
                    {/* Icon */}
                    <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                      {status === 'passed' && (
                        <svg className="w-4 h-4 text-success" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      {status === 'failed' && (
                        <svg className="w-4 h-4 text-error" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                      {status === 'skipped' && (
                        <svg className="w-4 h-4 text-ink-muted" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>

                    {/* Name + screen */}
                    <div className="flex-1 min-w-0">
                      <span className={
                        status === 'passed' ? 'text-ink-secondary' :
                        status === 'failed' ? 'text-error font-medium' :
                        'text-ink-muted'
                      }>
                        {step.name}
                      </span>
                      <span className="text-[13px] text-ink-muted ml-1.5 font-mono">{step.screen}</span>
                    </div>

                    {/* Duration */}
                    {stepDurations[i] > 0 && (
                      <span className="text-[13px] text-ink-muted font-mono flex-shrink-0">
                        {(stepDurations[i] / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>

                  {/* Error detail */}
                  {stepErrors[i] && (
                    <div className="mt-1.5 ml-7 px-2 py-1.5 bg-error/10 text-[14px] text-error font-mono break-all">
                      {stepErrors[i]}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Flow path */}
          <div className="px-4 py-2 border-t border-border-subtle">
            <p className="text-[13px] text-ink-muted font-mono leading-relaxed">
              {steps.map((s, i) => {
                const status = stepStatuses[i];
                const color = status === 'passed' ? 'text-success' : status === 'failed' ? 'text-error' : 'text-ink-muted';
                return (
                  <span key={i}>
                    {i > 0 && <span className="text-ink-muted"> → </span>}
                    <span className={color}>{s.screen}</span>
                  </span>
                );
              })}
            </p>
          </div>

          {/* Actions */}
          <div className="px-4 py-3 border-t border-border flex space-x-2">
            <button
              onClick={copyReport}
              className="btn-solid flex-1 px-3 py-1.5 text-xs flex items-center justify-center space-x-1.5"
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5 text-success" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-success">Copied!</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>Copy Report</span>
                </>
              )}
            </button>
            <button
              onClick={runTest}
              className="btn-solid-primary flex-1 px-3 py-1.5 text-xs font-medium"
            >
              Run Again
            </button>
            <button
              onClick={onClose}
              className="btn-solid px-3 py-1.5 text-xs"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Running / idle view
  return (
    <div className="fixed top-4 right-4 z-[100] w-80">
      <div className="bg-surface border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-spectrum-blue animate-pulse" />
            <h3 className="text-base font-sans font-semibold text-ink">Flow Test</h3>
          </div>
          <button
            onClick={onClose}
            disabled={isRunning}
            className="text-ink-muted hover:text-ink-secondary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Current step callout */}
        {isRunning && currentStep >= 0 && currentStep < steps.length && (
          <div className="mx-4 mt-3 px-3 py-2 bg-spectrum-blue/15 border border-spectrum-blue/30 flex items-center space-x-2">
            <div className="w-4 h-4 border-4 border-spectrum-blue border-t-transparent animate-spin flex-shrink-0" />
            <span className="text-sm text-spectrum-blue font-semibold">{steps[currentStep].name}</span>
            <span className="text-[13px] text-spectrum-blue/60 font-mono ml-auto">{steps[currentStep].screen}</span>
          </div>
        )}

        {/* Steps */}
        <div className="px-4 py-3 space-y-1 max-h-[400px] overflow-y-auto">
          {steps.map((step, i) => {
            const status = stepStatuses[i] || 'pending';
            return (
              <div
                key={i}
                className="flex items-center space-x-2.5 px-2 py-1 text-sm"
              >
                {/* Status icon */}
                <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                  {status === 'running' && (
                    <div className="w-2.5 h-2.5 bg-spectrum-blue animate-pulse" />
                  )}
                  {status === 'passed' && (
                    <svg className="w-5 h-5 text-success" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  {status === 'failed' && (
                    <svg className="w-5 h-5 text-error" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  )}
                  {status === 'skipped' && (
                    <div className="w-1.5 h-1.5 bg-ink-muted/20" />
                  )}
                  {status === 'pending' && (
                    <div className="w-2 h-2 bg-border" />
                  )}
                </div>

                {/* Label */}
                <span className={
                  status === 'running' ? 'text-ink font-semibold' :
                  status === 'passed' ? 'text-ink-muted line-through' :
                  status === 'failed' ? 'text-error font-medium' :
                  'text-ink-muted'
                }>
                  {step.name}
                </span>

                {/* Duration */}
                {(status === 'passed' || status === 'failed') && stepDurations[i] > 0 && (
                  <span className="text-[13px] text-ink-muted ml-auto font-mono">
                    {(stepDurations[i] / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 border-t border-border">
            <p className="text-xs text-error">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border">
          <button
            onClick={runTest}
            disabled={isRunning}
            className="btn-solid-primary w-full px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRunning ? (
              <span className="flex items-center justify-center space-x-2">
                <div className="w-4 h-4 border-4 border-spectrum-blue border-t-transparent animate-spin" />
                <span>Running...</span>
              </span>
            ) : (
              'Run Flow Test'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
