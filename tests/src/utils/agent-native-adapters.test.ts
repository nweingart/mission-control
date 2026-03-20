import { describe, it, expect } from 'vitest';
import { tasksToTaskNodes, buildMetricsToCostEntries, gitEventsToAgentSteps } from '../../../src/utils/agent-native-adapters';
import type { Task, TaskPipelineStatus, BuildMetrics, GitEvent } from '../../../src/types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test task',
    completed: false,
    ...overrides,
  };
}

function makePipelineStatus(overrides: Partial<TaskPipelineStatus> = {}): TaskPipelineStatus {
  return {
    taskId: 'task-1',
    phase: 'building',
    branchName: 'feat/test',
    worktreePath: '/tmp/wt',
    chatId: 'chat-1',
    output: '',
    ...overrides,
  };
}

describe('tasksToTaskNodes', () => {
  it('maps completed task to complete status', () => {
    const tasks = [makeTask({ completed: true })];
    const nodes = tasksToTaskNodes(tasks, new Map(), null, 'idle');
    expect(nodes[0].status).toBe('complete');
  });

  it('maps active task to running status with phase description', () => {
    const tasks = [makeTask({ id: 'task-1' })];
    const activeMap = new Map([['task-1', makePipelineStatus({ phase: 'building' })]]);
    const nodes = tasksToTaskNodes(tasks, activeMap, null, 'idle');
    expect(nodes[0].status).toBe('running');
    expect(nodes[0].description).toBe('Building...');
  });

  it('maps currentTaskId to running status', () => {
    const tasks = [makeTask({ id: 'task-1' })];
    const nodes = tasksToTaskNodes(tasks, new Map(), 'task-1', 'reviewing');
    expect(nodes[0].status).toBe('running');
    expect(nodes[0].description).toBe('Reviewing...');
  });

  it('maps paused task (buildPhase set) to waiting_approval', () => {
    const tasks = [makeTask({ buildPhase: 'built' })];
    const nodes = tasksToTaskNodes(tasks, new Map(), null, 'idle');
    expect(nodes[0].status).toBe('waiting_approval');
  });

  it('maps idle task to pending', () => {
    const tasks = [makeTask()];
    const nodes = tasksToTaskNodes(tasks, new Map(), null, 'idle');
    expect(nodes[0].status).toBe('pending');
  });

  it('groups tasks by tier into parent nodes', () => {
    const tasks = [
      makeTask({ id: 't1', title: 'Task A', tier: 0 }),
      makeTask({ id: 't2', title: 'Task B', tier: 0 }),
      makeTask({ id: 't3', title: 'Task C', tier: 1 }),
    ];
    const nodes = tasksToTaskNodes(tasks, new Map(), null, 'idle');
    expect(nodes).toHaveLength(2);
    expect(nodes[0].label).toBe('Tier 0');
    expect(nodes[0].children).toHaveLength(2);
    expect(nodes[1].label).toBe('Tier 1');
    expect(nodes[1].children).toHaveLength(1);
  });

  it('puts tierless tasks at root level', () => {
    const tasks = [
      makeTask({ id: 't1', title: 'Tiered', tier: 0 }),
      makeTask({ id: 't2', title: 'Loose' }),
    ];
    const nodes = tasksToTaskNodes(tasks, new Map(), null, 'idle');
    expect(nodes).toHaveLength(2);
    expect(nodes[0].label).toBe('Tier 0');
    expect(nodes[1].label).toBe('Loose');
    expect(nodes[1].children).toBeUndefined();
  });

  it('handles empty task array', () => {
    const nodes = tasksToTaskNodes([], new Map(), null, 'idle');
    expect(nodes).toEqual([]);
  });

  it('sets tier status to complete when all children complete', () => {
    const tasks = [
      makeTask({ id: 't1', tier: 0, completed: true }),
      makeTask({ id: 't2', tier: 0, completed: true }),
    ];
    const nodes = tasksToTaskNodes(tasks, new Map(), null, 'idle');
    expect(nodes[0].status).toBe('complete');
  });

  it('sets tier status to running when any child is running', () => {
    const tasks = [
      makeTask({ id: 't1', tier: 0, completed: true }),
      makeTask({ id: 't2', tier: 0 }),
    ];
    const activeMap = new Map([['t2', makePipelineStatus({ taskId: 't2' })]]);
    const nodes = tasksToTaskNodes(tasks, activeMap, null, 'idle');
    expect(nodes[0].status).toBe('running');
  });
});

describe('buildMetricsToCostEntries', () => {
  const baseMetrics: BuildMetrics = {
    totalTokens: { input: 5000, output: 2000 },
    totalCostUsd: 0.05,
    taskMetrics: [],
    wallClockMs: 60000,
    tiersExecuted: 1,
    tasksCompleted: 2,
    tasksFailed: 0,
    tasksRetried: 0,
  };

  it('creates CostEntry per taskMetric', () => {
    const metrics: BuildMetrics = {
      ...baseMetrics,
      taskMetrics: [
        {
          taskId: 't1',
          taskTitle: 'Task 1',
          tokens: { total: { input: 3000, output: 1000 }, buildAgent: 'claude' },
          wallClockMs: 30000,
          tier: 0,
        },
        {
          taskId: 't2',
          taskTitle: 'Task 2',
          tokens: { total: { input: 2000, output: 1000 }, buildAgent: 'codex' },
          wallClockMs: 30000,
          tier: 0,
        },
      ],
    };
    const entries = buildMetricsToCostEntries(metrics);
    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe('t1');
    expect(entries[1].id).toBe('t2');
  });

  it('uses buildAgent as model name', () => {
    const metrics: BuildMetrics = {
      ...baseMetrics,
      taskMetrics: [
        {
          taskId: 't1',
          taskTitle: 'Task 1',
          tokens: { total: { input: 3000, output: 1000 }, buildAgent: 'codex' },
          wallClockMs: 30000,
          tier: 0,
        },
      ],
    };
    const entries = buildMetricsToCostEntries(metrics);
    expect(entries[0].model).toBe('codex');
  });

  it('defaults model to claude when no agent specified', () => {
    const metrics: BuildMetrics = {
      ...baseMetrics,
      taskMetrics: [
        {
          taskId: 't1',
          taskTitle: 'Task 1',
          tokens: { total: { input: 3000, output: 1000 } },
          wallClockMs: 30000,
          tier: 0,
        },
      ],
    };
    const entries = buildMetricsToCostEntries(metrics);
    expect(entries[0].model).toBe('claude');
  });

  it('handles empty taskMetrics', () => {
    const entries = buildMetricsToCostEntries(baseMetrics);
    expect(entries).toEqual([]);
  });

  it('maps inputTokens and outputTokens correctly', () => {
    const metrics: BuildMetrics = {
      ...baseMetrics,
      taskMetrics: [
        {
          taskId: 't1',
          taskTitle: 'Task 1',
          tokens: { total: { input: 4500, output: 1200 } },
          wallClockMs: 30000,
          tier: 0,
        },
      ],
    };
    const entries = buildMetricsToCostEntries(metrics);
    expect(entries[0].inputTokens).toBe(4500);
    expect(entries[0].outputTokens).toBe(1200);
    expect(entries[0].cost).toBe(5700);
  });
});

// ─── gitEventsToAgentSteps ────────────────────────────────────────

function makeGitEvent(overrides: Partial<GitEvent> = {}): GitEvent {
  return {
    id: 'evt-1',
    type: 'committed',
    timestamp: '2025-03-01T12:00:00Z',
    ...overrides,
  };
}

describe('gitEventsToAgentSteps', () => {
  it('maps each event type to correct label', () => {
    const events: GitEvent[] = [
      makeGitEvent({ type: 'branch_created', branchName: 'feat/x' }),
      makeGitEvent({ id: 'e2', type: 'committed', commitMessage: 'init' }),
      makeGitEvent({ id: 'e3', type: 'merged' }),
      makeGitEvent({ id: 'e4', type: 'pushed' }),
      makeGitEvent({ id: 'e5', type: 'auto_fixed', commitMessage: 'fix lint' }),
      makeGitEvent({ id: 'e6', type: 'gap_analysis_complete', commitMessage: 'gap done' }),
      makeGitEvent({ id: 'e7', type: 'deployed', commitMessage: 'v1.0' }),
      makeGitEvent({
        id: 'e8',
        type: 'review_completed',
        reviewArtifact: { findings: [{ severity: 'info', category: 'style', description: 'test', file: 'a.ts', fixed: false }], summary: '' },
      }),
    ];
    const steps = gitEventsToAgentSteps(events);
    expect(steps[0].label).toBe('Branch created: feat/x');
    expect(steps[1].label).toBe('Committed: "init"');
    expect(steps[2].label).toBe('Merged to main');
    expect(steps[3].label).toBe('Pushed to remote');
    expect(steps[4].label).toBe('Auto-fixed: "fix lint"');
    expect(steps[5].label).toBe('gap done');
    expect(steps[6].label).toBe('v1.0');
    expect(steps[7].label).toBe('Review: 1 finding');
  });

  it('sets status to complete for all events', () => {
    const events = [makeGitEvent(), makeGitEvent({ id: 'e2', type: 'merged' })];
    const steps = gitEventsToAgentSteps(events);
    expect(steps.every(s => s.status === 'complete')).toBe(true);
  });

  it('sets completedAt from event timestamp', () => {
    const ts = '2025-06-15T08:30:00Z';
    const steps = gitEventsToAgentSteps([makeGitEvent({ timestamp: ts })]);
    expect(steps[0].completedAt).toBe(new Date(ts).getTime());
  });

  it('carries commitHash and reviewArtifact in metadata', () => {
    const artifact = { findings: [], summary: 'ok' };
    const steps = gitEventsToAgentSteps([
      makeGitEvent({ commitHash: 'abc123', reviewArtifact: artifact }),
    ]);
    expect(steps[0].metadata?.commitHash).toBe('abc123');
    expect(steps[0].metadata?.reviewArtifact).toBe(artifact);
  });

  it('sets isClickable for committed/auto_fixed events with commitHash', () => {
    const steps = gitEventsToAgentSteps([
      makeGitEvent({ type: 'committed', commitHash: 'abc' }),
      makeGitEvent({ id: 'e2', type: 'auto_fixed', commitHash: 'def' }),
    ]);
    expect(steps[0].metadata?.isClickable).toBe(true);
    expect(steps[1].metadata?.isClickable).toBe(true);
  });

  it('sets isClickable false for events without commitHash', () => {
    const steps = gitEventsToAgentSteps([
      makeGitEvent({ type: 'committed' }),
      makeGitEvent({ id: 'e2', type: 'merged' }),
    ]);
    expect(steps[0].metadata?.isClickable).toBe(false);
    expect(steps[1].metadata?.isClickable).toBe(false);
  });

  it('handles empty event array', () => {
    expect(gitEventsToAgentSteps([])).toEqual([]);
  });
});
