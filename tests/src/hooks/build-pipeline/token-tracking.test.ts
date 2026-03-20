import { describe, it, expect } from 'vitest';
import { extractTokens, accumulateTokenDeltas, computeFinalBuildMetrics } from '../../../../src/hooks/build-pipeline/token-tracking';
import type { ChatResult, Task, TokenCount } from '../../../../src/types';

describe('extractTokens', () => {
  it('extracts token counts from ChatResult with usage', () => {
    const result: ChatResult = {
      response: 'hello',
      usage: { input_tokens: 100, output_tokens: 50 },
    };
    const tokens = extractTokens(result);
    expect(tokens).toEqual({ input: 100, output: 50 });
  });

  it('returns undefined when no usage data', () => {
    const result: ChatResult = { response: 'hello' };
    expect(extractTokens(result)).toBeUndefined();
  });
});

describe('accumulateTokenDeltas', () => {
  it('returns token delta and cost from ChatResult', () => {
    const result: ChatResult = {
      response: 'ok',
      usage: { input_tokens: 200, output_tokens: 100 },
      costUsd: 0.05,
    };
    const { tokensDelta, costDelta } = accumulateTokenDeltas(result);
    expect(tokensDelta).toEqual({ input: 200, output: 100 });
    expect(costDelta).toBe(0.05);
  });

  it('returns null delta and zero cost when no usage', () => {
    const result: ChatResult = { response: 'ok' };
    const { tokensDelta, costDelta } = accumulateTokenDeltas(result);
    expect(tokensDelta).toBeNull();
    expect(costDelta).toBe(0);
  });
});

describe('computeFinalBuildMetrics', () => {
  it('computes aggregate metrics from completed tasks', () => {
    const tasks: Task[] = [
      {
        id: 'task-1',
        title: 'Setup',
        description: 'Init project',
        completed: true,
        tier: 0,
        tokenUsage: {
          build: { input: 100, output: 50 },
          total: { input: 100, output: 50 },
        },
      },
      {
        id: 'task-2',
        title: 'Build',
        description: 'Build features',
        completed: true,
        tier: 1,
        tokenUsage: {
          build: { input: 200, output: 100 },
          review: { input: 50, output: 25 },
          total: { input: 250, output: 125 },
        },
      },
      {
        id: 'task-3',
        title: 'Failed',
        description: 'This failed',
        completed: false,
        tier: 1,
      },
    ];

    const buildTokens: TokenCount = { input: 350, output: 175 };
    const taskStartTimes = new Map([
      ['task-1', Date.now() - 5000],
      ['task-2', Date.now() - 3000],
    ]);

    const metrics = computeFinalBuildMetrics(
      tasks,
      buildTokens,
      0.10,
      Date.now() - 10000,
      taskStartTimes,
      2,
      ['task-3'],
      1,
    );

    expect(metrics.totalTokens).toEqual({ input: 350, output: 175 });
    expect(metrics.totalCostUsd).toBe(0.10);
    expect(metrics.tiersExecuted).toBe(2);
    expect(metrics.tasksCompleted).toBe(2);
    expect(metrics.tasksFailed).toBe(1);
    expect(metrics.tasksRetried).toBe(1);
    expect(metrics.taskMetrics).toHaveLength(2);
    expect(metrics.taskMetrics[0].taskId).toBe('task-1');
    expect(metrics.wallClockMs).toBeGreaterThanOrEqual(9000);
  });

  it('handles empty task list', () => {
    const metrics = computeFinalBuildMetrics(
      [],
      { input: 0, output: 0 },
      0,
      Date.now(),
      new Map(),
      0,
      [],
      0,
    );
    expect(metrics.tasksCompleted).toBe(0);
    expect(metrics.tasksFailed).toBe(0);
    expect(metrics.taskMetrics).toHaveLength(0);
  });
});
