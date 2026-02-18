type SaveFn<T> = (projectSlug: string, data: T) => Promise<void>;

interface EnqueueOptions<T> {
  projectSlug: string;
  resourceKey: string;
  data: T;
  save: SaveFn<T>;
  errorMessage: string;
  debounceMs?: number;
}

interface QueueHandlers {
  onPendingChange?: (hasPending: boolean, count: number) => void;
  onError?: (message: string) => void;
}

interface QueueEntry {
  key: string;
  projectSlug: string;
  resourceKey: string;
  data: unknown;
  save: SaveFn<unknown>;
  errorMessage: string;
  debounceMs: number;
  retryCount: number;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<void> | null;
}

const entries = new Map<string, QueueEntry>();
let handlers: QueueHandlers = {};

const DEFAULT_DEBOUNCE_MS = 250;
const BASE_RETRY_MS = 500;
const MAX_RETRY_MS = 10_000;
const MAX_FAST_RETRIES = 5;
const SLOW_RETRY_MS = 30_000;

function makeKey(projectSlug: string, resourceKey: string): string {
  return `${projectSlug}::${resourceKey}`;
}

function notifyPendingChange(): void {
  const count = entries.size;
  handlers.onPendingChange?.(count > 0, count);
}

function schedule(entry: QueueEntry, delayMs: number): void {
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    void flushByKey(entry.key);
  }, delayMs);
}

async function flushByKey(key: string): Promise<void> {
  const entry = entries.get(key);
  if (!entry) return;

  if (entry.inFlight) {
    await entry.inFlight;
    return;
  }

  const snapshot = entry.data;

  const run = (async () => {
    try {
      await entry.save(entry.projectSlug, snapshot);
      const latest = entries.get(key);
      if (!latest) return;

      // New writes arrived while this write was in-flight; flush the latest payload.
      if (latest.data !== snapshot) {
        latest.retryCount = 0;
        schedule(latest, latest.debounceMs);
        return;
      }

      entries.delete(key);
      notifyPendingChange();
    } catch (err) {
      const latest = entries.get(key);
      if (!latest) return;

      latest.retryCount += 1;
      const useSlowRetry = latest.retryCount > MAX_FAST_RETRIES;
      const delay = useSlowRetry
        ? SLOW_RETRY_MS
        : Math.min(BASE_RETRY_MS * Math.pow(2, latest.retryCount - 1), MAX_RETRY_MS);

      // Only surface the error on first failure and when switching to slow retry mode.
      if (latest.retryCount === 1 || latest.retryCount === MAX_FAST_RETRIES + 1) {
        handlers.onError?.(`${latest.errorMessage} Retrying in background.`);
      }

      console.error('[persistenceQueue] Save failed:', latest.resourceKey, err);
      schedule(latest, delay);
    } finally {
      const latest = entries.get(key);
      if (latest) latest.inFlight = null;
    }
  })();

  entry.inFlight = run;
  await run;
}

export function configurePersistenceQueue(nextHandlers: QueueHandlers): void {
  handlers = nextHandlers;
  notifyPendingChange();
}

export function enqueuePersistenceSave<T>(options: EnqueueOptions<T>): void {
  const key = makeKey(options.projectSlug, options.resourceKey);
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  const existing = entries.get(key);
  if (existing) {
    existing.data = options.data;
    existing.save = options.save as SaveFn<unknown>;
    existing.errorMessage = options.errorMessage;
    existing.debounceMs = debounceMs;
    existing.retryCount = 0;
    schedule(existing, debounceMs);
    return;
  }

  const entry: QueueEntry = {
    key,
    projectSlug: options.projectSlug,
    resourceKey: options.resourceKey,
    data: options.data,
    save: options.save as SaveFn<unknown>,
    errorMessage: options.errorMessage,
    debounceMs,
    retryCount: 0,
    timer: null,
    inFlight: null,
  };

  entries.set(key, entry);
  notifyPendingChange();
  schedule(entry, debounceMs);
}

interface PersistNowOptions {
  strict?: boolean;
}

export async function persistNow<T>(options: EnqueueOptions<T>, config?: PersistNowOptions): Promise<void> {
  enqueuePersistenceSave({ ...options, debounceMs: 0 });
  const key = makeKey(options.projectSlug, options.resourceKey);

  if (!config?.strict) {
    await flushByKey(key);
    return;
  }

  const entry = entries.get(key);
  if (!entry) return;

  // We are forcing an immediate write in this code path; suppress scheduled timer flush.
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }

  // If a write is already in-flight, wait for it first so strict mode evaluates latest state.
  if (entry.inFlight) {
    await entry.inFlight;
  }

  const latest = entries.get(key);
  if (!latest) return;
  const snapshot = latest.data;

  try {
    await latest.save(latest.projectSlug, snapshot);

    const latestAfterSave = entries.get(key);
    if (!latestAfterSave) return;

    if (latestAfterSave.data !== snapshot) {
      latestAfterSave.retryCount = 0;
      schedule(latestAfterSave, latestAfterSave.debounceMs);
      return;
    }

    entries.delete(key);
    notifyPendingChange();
  } catch (err) {
    const latestOnFailure = entries.get(key);
    if (latestOnFailure) {
      latestOnFailure.retryCount += 1;
      const useSlowRetry = latestOnFailure.retryCount > MAX_FAST_RETRIES;
      const delay = useSlowRetry
        ? SLOW_RETRY_MS
        : Math.min(BASE_RETRY_MS * Math.pow(2, latestOnFailure.retryCount - 1), MAX_RETRY_MS);

      if (latestOnFailure.retryCount === 1 || latestOnFailure.retryCount === MAX_FAST_RETRIES + 1) {
        handlers.onError?.(`${latestOnFailure.errorMessage} Retrying in background.`);
      }

      console.error('[persistenceQueue] Strict save failed:', latestOnFailure.resourceKey, err);
      schedule(latestOnFailure, delay);
    }

    throw err;
  }
}

export async function retryAllPendingSaves(): Promise<void> {
  const keys = Array.from(entries.keys());
  await Promise.all(keys.map((key) => flushByKey(key)));
}
