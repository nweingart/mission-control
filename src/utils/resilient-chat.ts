import { useAppStore } from '../store/useAppStore';
import type { AgentProvider } from '../types';

// ── Error type guards ──────────────────────────────────────

export function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('no output for') || msg.includes('timed out');
}

export function isCancelError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message === 'cancelled';
}

// ── Types ──────────────────────────────────────────────────

interface ResilientChatOptions {
  maxRetries?: number;
  inactivityTimeoutMs?: number;
  onRetryAttempt?: (attempt: number, maxRetries: number) => void;
  /** If provided, will fire a toast with Retry on final failure */
  retryAction?: () => void;
  /** Which agent to use — defaults to 'claude' */
  agent?: AgentProvider;
  /** Use structured JSON streaming (emits events via onStreamEventForTask) */
  streaming?: boolean;
  /** Called when a retry generates a new chatId — use to re-subscribe stream listeners */
  onChatIdChange?: (newChatId: string) => void;
}

interface ResilientChatResult {
  promise: Promise<string>;
  cancel: () => void;
  /** The chatId used — needed to subscribe to streaming events via onStreamEventForTask / onChatOutputForTask */
  chatId: string;
}

// ── Core function ──────────────────────────────────────────

export function resilientChat(
  projectPath: string,
  prompt: string,
  options: ResilientChatOptions = {},
): ResilientChatResult {
  const {
    maxRetries = 2,
    inactivityTimeoutMs,
    onRetryAttempt,
    retryAction,
    agent = 'claude',
    streaming = false,
    onChatIdChange,
  } = options;

  // Select the correct API based on agent and streaming mode
  const chatFn = agent === 'codex'
    ? window.api.codex.chat
    : streaming
      ? window.api.claude.chatStreaming
      : window.api.claude.chat;
  const cancelFn = agent === 'codex' ? window.api.codex.cancelChat : window.api.claude.cancelChat;

  let cancelled = false;
  let currentChatId = 'chat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

  const cancel = () => {
    cancelled = true;
    if (currentChatId) {
      cancelFn(currentChatId).catch(() => {});
    }
  };

  const promise = (async (): Promise<string> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (cancelled) throw new Error('cancelled');

      if (attempt > 0) {
        currentChatId = 'chat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
        onChatIdChange?.(currentChatId);
      }
      try {
        const result = await chatFn(projectPath, prompt, inactivityTimeoutMs, currentChatId);
        return result.response;
      } catch (err) {
        if (cancelled) throw new Error('cancelled');

        if (!isTimeoutError(err) || attempt === maxRetries) {
          // Final failure — fire toast if retryAction provided
          if (retryAction && !isCancelError(err)) {
            const message = err instanceof Error ? err.message : 'Claude request failed';
            useAppStore.getState().addToast({
              type: 'error',
              message: message.length > 120 ? message.slice(0, 117) + '...' : message,
              ctaLabel: 'Retry',
              ctaAction: retryAction,
            });
          }
          throw err;
        }

        // Timeout — retry
        console.log(`[resilientChat] Timeout, retry ${attempt + 1}/${maxRetries}`);
        onRetryAttempt?.(attempt + 1, maxRetries);
        await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      }
    }
    throw new Error('unreachable');
  })();

  return { promise, cancel, chatId: currentChatId };
}

// ── Presets ────────────────────────────────────────────────

/** 1 retry, 3 min inactivity timeout */
resilientChat.quick = (
  projectPath: string,
  prompt: string,
  extra?: Omit<ResilientChatOptions, 'maxRetries' | 'inactivityTimeoutMs'>,
) =>
  resilientChat(projectPath, prompt, {
    maxRetries: 1,
    inactivityTimeoutMs: 3 * 60 * 1000,
    ...extra,
  });

/** 2 retries, 5 min inactivity timeout */
resilientChat.standard = (
  projectPath: string,
  prompt: string,
  extra?: Omit<ResilientChatOptions, 'maxRetries' | 'inactivityTimeoutMs'>,
) =>
  resilientChat(projectPath, prompt, {
    maxRetries: 2,
    inactivityTimeoutMs: 5 * 60 * 1000,
    ...extra,
  });

/** 2 retries, 10 min inactivity timeout */
resilientChat.long = (
  projectPath: string,
  prompt: string,
  extra?: Omit<ResilientChatOptions, 'maxRetries' | 'inactivityTimeoutMs'>,
) =>
  resilientChat(projectPath, prompt, {
    maxRetries: 2,
    inactivityTimeoutMs: 10 * 60 * 1000,
    ...extra,
  });
