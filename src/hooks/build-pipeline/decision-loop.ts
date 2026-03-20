import type { Task, DecisionRequest, ResolvedDecision, InteractionDepth } from '../../types';
import type { AgentAPI } from '../../utils/agent-router';
import { parseDecisionTag, hasCompleteDecisionTag, stripDecisionTags } from '../../utils/decision-parser';
import { buildDepthInstructions } from '../../utils/build-helpers';

const DECISION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export interface DecisionCallbacks {
  /** Called when a <DECISION> tag is detected — should surface it to the UI */
  onDecisionDetected: (decision: DecisionRequest) => void;
  /** Called when a decision is resolved (by user or auto-timeout) */
  onDecisionResolved: (resolved: ResolvedDecision) => void;
  /** Returns a promise that resolves with the user's response (or auto-resolves after timeout) */
  waitForDecisionResponse: (decision: DecisionRequest) => Promise<string>;
}

/**
 * Determine the effective depth for a task given its agent.
 * If the agent doesn't support chatWithResume (e.g. Codex), force 'small'.
 */
export function effectiveDepth(agent: AgentAPI, task: Task): InteractionDepth {
  const depth = task.interactionDepth ?? 'small';
  if (depth !== 'small' && !agent.chatWithResume) {
    console.warn(
      `[DecisionLoop] Agent "${agent.provider}" lacks chatWithResume — forcing task "${task.title}" to depth 'small'`,
    );
    return 'small';
  }
  return depth;
}

/**
 * Runs the build phase using chatWithResume, detecting <DECISION> tags
 * and pausing for user input. For 'small' depth, falls back to a single chat() call.
 *
 * Returns the final response text (with decision tags stripped).
 */
export async function buildWithDecisionLoop(
  agent: AgentAPI,
  workPath: string,
  basePrompt: string,
  _task: Task,
  depth: InteractionDepth,
  chatId: string,
  timeoutMs: number,
  callbacks: DecisionCallbacks,
): Promise<string> {
  // Small depth or no multi-turn support: single-shot build
  if (depth === 'small' || !agent.chatWithResume) {
    const result = await agent.chat(workPath, basePrompt, timeoutMs, chatId);
    return result.response;
  }

  // Append depth instructions to the initial prompt
  const depthInstructions = buildDepthInstructions(depth);
  const fullPrompt = depthInstructions
    ? basePrompt + '\n' + depthInstructions
    : basePrompt;

  let sessionId: string | null = null;
  let fullResponse = '';
  let nextPrompt: string = fullPrompt;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let result: { response: string; sessionId: string };
    try {
      result = await agent.chatWithResume(
        workPath,
        nextPrompt,
        sessionId,
        timeoutMs,
        chatId,
      );
    } catch (err) {
      // If we have partial output, return it rather than losing everything
      if (fullResponse.length > 0) {
        console.warn('[DecisionLoop] Session error after partial response, returning what we have:', err);
        return stripDecisionTags(fullResponse);
      }
      throw err;
    }

    sessionId = result.sessionId;
    fullResponse += result.response;

    // Check for <DECISION> tag in the response
    if (hasCompleteDecisionTag(result.response)) {
      const decision = parseDecisionTag(result.response);
      if (decision) {
        callbacks.onDecisionDetected(decision);

        let userResponse: string;
        try {
          // Wait for user response (or auto-timeout)
          userResponse = await callbacks.waitForDecisionResponse(decision);
        } catch (gateErr) {
          // Gate failed (e.g. pipeline cancelled) — auto-resolve and continue
          console.warn('[DecisionLoop] Decision gate failed, auto-resolving:', gateErr);
          userResponse = decision.options?.[0]
            ? `[auto] Proceeding with: ${decision.options[0]}`
            : '[auto] Proceeding with your best judgment.';
        }

        const resolved: ResolvedDecision = {
          ...decision,
          response: userResponse,
          resolvedBy: userResponse.startsWith('[auto]') ? 'auto' : 'user',
          resolvedAt: Date.now(),
        };
        callbacks.onDecisionResolved(resolved);

        // Continue the session with the user's response
        nextPrompt = userResponse;
        continue;
      }
    }

    // No decision tag — build is complete
    break;
  }

  return stripDecisionTags(fullResponse);
}

/**
 * Creates a decision gate — a paired [wait, resolve] for coordinating
 * between the build loop and the UI.
 */
export function createDecisionGate(): {
  waitForDecisionResponse: (decision: DecisionRequest) => Promise<string>;
  resolveDecision: (response: string) => void;
} {
  let resolveFn: ((response: string) => void) | null = null;

  const waitForDecisionResponse = (decision: DecisionRequest): Promise<string> => {
    return new Promise<string>((resolve) => {
      // Auto-resolve after timeout
      const timer = setTimeout(() => {
        if (resolveFn) {
          resolveFn = null;
          const autoResponse = decision.options?.[0]
            ? `[auto] Proceeding with: ${decision.options[0]}`
            : '[auto] Proceeding with your best judgment.';
          resolve(autoResponse);
        }
      }, DECISION_TIMEOUT_MS);

      resolveFn = (response: string) => {
        clearTimeout(timer);
        resolveFn = null;
        resolve(response);
      };
    });
  };

  const resolveDecision = (response: string) => {
    if (resolveFn) {
      resolveFn(response);
    }
  };

  return { waitForDecisionResponse, resolveDecision };
}

/**
 * Compute effective concurrency cap for a tier based on interaction depths.
 * Small=3, Medium=2, Large=1 (most restrictive wins).
 */
export function effectiveConcurrencyCap(tasks: Task[]): number {
  let cap = 3;
  for (const task of tasks) {
    const depth = task.interactionDepth ?? 'small';
    if (depth === 'large') return 1;
    if (depth === 'medium' && cap > 2) cap = 2;
  }
  return cap;
}
