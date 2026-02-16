import { useAppStore } from '../store/useAppStore';

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
}

interface ResilientChatResult {
  promise: Promise<string>;
  cancel: () => void;
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
  } = options;

  let cancelled = false;
  let currentChatId = '';

  const cancel = () => {
    cancelled = true;
    if (currentChatId) {
      window.api.claude.cancelChat(currentChatId).catch(() => {});
    }
  };

  const promise = (async (): Promise<string> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (cancelled) throw new Error('cancelled');

      currentChatId = 'chat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      try {
        return await window.api.claude.chat(projectPath, prompt, inactivityTimeoutMs, currentChatId);
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

  return { promise, cancel };
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
