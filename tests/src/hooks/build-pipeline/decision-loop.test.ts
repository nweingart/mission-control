import { describe, it, expect, vi } from 'vitest';
import {
  effectiveDepth,
  buildWithDecisionLoop,
  createDecisionGate,
  effectiveConcurrencyCap,
} from '../../../../src/hooks/build-pipeline/decision-loop';
import type { Task, DecisionRequest } from '../../../../src/types';
import type { AgentAPI } from '../../../../src/utils/agent-router';

function mockAgent(overrides: Partial<AgentAPI> = {}): AgentAPI {
  return {
    provider: 'claude',
    chat: vi.fn().mockResolvedValue({ response: 'done', usage: {} }),
    chatStreaming: vi.fn().mockResolvedValue({ response: 'done', usage: {} }),
    chatWithResume: vi.fn().mockResolvedValue({ response: 'done', sessionId: 'sess-1' }),
    cancelChat: vi.fn(),
    ...overrides,
  };
}

function mockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test task',
    completed: false,
    ...overrides,
  };
}

describe('effectiveDepth', () => {
  it('returns the task depth when agent supports chatWithResume', () => {
    const agent = mockAgent();
    const task = mockTask({ interactionDepth: 'large' });
    expect(effectiveDepth(agent, task)).toBe('large');
  });

  it('forces small when agent lacks chatWithResume', () => {
    const agent = mockAgent({ chatWithResume: undefined });
    const task = mockTask({ interactionDepth: 'large' });
    expect(effectiveDepth(agent, task)).toBe('small');
  });

  it('defaults to small when task has no interactionDepth', () => {
    const agent = mockAgent();
    const task = mockTask();
    expect(effectiveDepth(agent, task)).toBe('small');
  });
});

describe('effectiveConcurrencyCap', () => {
  it('returns 3 for all small tasks', () => {
    const tasks = [
      mockTask({ interactionDepth: 'small' }),
      mockTask({ interactionDepth: 'small' }),
    ];
    expect(effectiveConcurrencyCap(tasks)).toBe(3);
  });

  it('returns 2 when any task is medium', () => {
    const tasks = [
      mockTask({ interactionDepth: 'small' }),
      mockTask({ interactionDepth: 'medium' }),
    ];
    expect(effectiveConcurrencyCap(tasks)).toBe(2);
  });

  it('returns 1 when any task is large', () => {
    const tasks = [
      mockTask({ interactionDepth: 'small' }),
      mockTask({ interactionDepth: 'large' }),
    ];
    expect(effectiveConcurrencyCap(tasks)).toBe(1);
  });

  it('returns 3 for tasks with no depth set', () => {
    const tasks = [mockTask(), mockTask()];
    expect(effectiveConcurrencyCap(tasks)).toBe(3);
  });
});

describe('createDecisionGate', () => {
  it('resolves when user provides a response', async () => {
    const { waitForDecisionResponse, resolveDecision } = createDecisionGate();
    const decision: DecisionRequest = {
      question: 'Pick one',
      options: ['A', 'B'],
    };

    const promise = waitForDecisionResponse(decision);
    resolveDecision('B');

    await expect(promise).resolves.toBe('B');
  });

  it('auto-resolves with first option after timeout', async () => {
    vi.useFakeTimers();
    const { waitForDecisionResponse } = createDecisionGate();
    const decision: DecisionRequest = {
      question: 'Pick one',
      options: ['Option A', 'Option B'],
    };

    const promise = waitForDecisionResponse(decision);
    vi.advanceTimersByTime(10 * 60 * 1000); // 10 minutes

    await expect(promise).resolves.toBe('[auto] Proceeding with: Option A');
    vi.useRealTimers();
  });

  it('auto-resolves with best judgment when no options', async () => {
    vi.useFakeTimers();
    const { waitForDecisionResponse } = createDecisionGate();
    const decision: DecisionRequest = {
      question: 'What should we do?',
    };

    const promise = waitForDecisionResponse(decision);
    vi.advanceTimersByTime(10 * 60 * 1000);

    await expect(promise).resolves.toBe('[auto] Proceeding with your best judgment.');
    vi.useRealTimers();
  });

  it('ignores resolve after timeout', async () => {
    vi.useFakeTimers();
    const { waitForDecisionResponse, resolveDecision } = createDecisionGate();
    const decision: DecisionRequest = {
      question: 'Pick one',
      options: ['A'],
    };

    const promise = waitForDecisionResponse(decision);
    vi.advanceTimersByTime(10 * 60 * 1000);
    const result = await promise;

    // Calling resolve after timeout should not throw
    resolveDecision('late response');
    expect(result).toBe('[auto] Proceeding with: A');
    vi.useRealTimers();
  });
});

describe('buildWithDecisionLoop', () => {
  const noopCallbacks = {
    onDecisionDetected: vi.fn(),
    onDecisionResolved: vi.fn(),
    waitForDecisionResponse: vi.fn(),
  };

  it('uses single chat() for small depth', async () => {
    const agent = mockAgent();
    const task = mockTask({ interactionDepth: 'small' });

    const result = await buildWithDecisionLoop(
      agent, '/project', 'build it', task, 'small', 'chat-1', 60000, noopCallbacks,
    );

    expect(agent.chat).toHaveBeenCalledWith('/project', 'build it', 60000, 'chat-1');
    expect(agent.chatWithResume).not.toHaveBeenCalled();
    expect(result).toBe('done');
  });

  it('uses chatWithResume for medium/large depth', async () => {
    const agent = mockAgent();
    const task = mockTask({ interactionDepth: 'medium' });

    await buildWithDecisionLoop(
      agent, '/project', 'build it', task, 'medium', 'chat-1', 60000, noopCallbacks,
    );

    expect(agent.chatWithResume).toHaveBeenCalled();
    expect(agent.chat).not.toHaveBeenCalled();
  });

  it('falls back to chat() when agent lacks chatWithResume', async () => {
    const agent = mockAgent({ chatWithResume: undefined });
    const task = mockTask({ interactionDepth: 'medium' });

    await buildWithDecisionLoop(
      agent, '/project', 'build it', task, 'medium', 'chat-1', 60000, noopCallbacks,
    );

    expect(agent.chat).toHaveBeenCalled();
  });

  it('handles decision tags in response', async () => {
    const agent = mockAgent({
      chatWithResume: vi.fn()
        .mockResolvedValueOnce({
          response: 'Working... <DECISION>\n<question>Pick a framework</question>\n<option>React</option>\n<option>Vue</option>\n</DECISION>',
          sessionId: 'sess-1',
        })
        .mockResolvedValueOnce({
          response: 'Built with React. Done!',
          sessionId: 'sess-1',
        }),
    });

    const callbacks = {
      onDecisionDetected: vi.fn(),
      onDecisionResolved: vi.fn(),
      waitForDecisionResponse: vi.fn().mockResolvedValue('React'),
    };

    const result = await buildWithDecisionLoop(
      agent, '/project', 'build it', mockTask({ interactionDepth: 'medium' }),
      'medium', 'chat-1', 60000, callbacks,
    );

    expect(callbacks.onDecisionDetected).toHaveBeenCalled();
    expect(callbacks.onDecisionResolved).toHaveBeenCalledWith(
      expect.objectContaining({ response: 'React', resolvedBy: 'user' }),
    );
    expect(result).toContain('Built with React');
  });

  it('returns partial response on session error', async () => {
    const agent = mockAgent({
      chatWithResume: vi.fn()
        .mockResolvedValueOnce({ response: 'Partial work done. ', sessionId: 'sess-1' })
        .mockRejectedValueOnce(new Error('Connection lost')),
    });

    // The second call will fail but we already have partial output
    // Need to trigger a second iteration — only happens if first response has a decision tag
    // Actually, without a decision tag the loop breaks after first call. Let me adjust.
    const agent2 = mockAgent({
      chatWithResume: vi.fn()
        .mockResolvedValueOnce({
          response: 'Partial work. <DECISION>\n<question>Continue?</question>\n<option>Yes</option>\n</DECISION>',
          sessionId: 'sess-1',
        })
        .mockRejectedValueOnce(new Error('Connection lost')),
    });

    const callbacks = {
      onDecisionDetected: vi.fn(),
      onDecisionResolved: vi.fn(),
      waitForDecisionResponse: vi.fn().mockResolvedValue('Yes'),
    };

    const result = await buildWithDecisionLoop(
      agent2, '/project', 'build', mockTask({ interactionDepth: 'medium' }),
      'medium', 'chat-1', 60000, callbacks,
    );

    // Should return partial response rather than throwing
    expect(result).toContain('Partial work');
  });
});
