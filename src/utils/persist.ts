import { enqueuePersistenceSave } from '../lib/persistenceQueue';

/**
 * Fire-and-forget save with a single retry on failure.
 * On final failure: logs the error and sets saveError on the store.
 *
 * @deprecated Use persistQueued() instead — it debounces rapid saves and
 * snapshots data at enqueue time to avoid stale-closure races.
 */
export function persistFireAndForget(
  saveFn: () => Promise<unknown>,
  set: (partial: { saveError: string }) => void,
  label: string,
): void {
  saveFn().catch((err) => {
    console.warn(`[persist] ${label} failed, retrying in 500ms:`, err);
    setTimeout(() => {
      saveFn().catch((retryErr) => {
        console.error(`[persist] ${label} retry failed:`, retryErr);
        set({ saveError: `Failed to save ${label}. Your changes may not persist.` });
      });
    }, 500);
  });
}

/**
 * Enqueue a debounced, coalesced save via the persistence queue.
 * Data is snapshot at call time — not read later from the store — preventing
 * stale-closure races when the user makes rapid edits.
 */
export function persistQueued<T>(
  projectSlug: string,
  resourceKey: string,
  data: T,
  save: (slug: string, d: T) => Promise<void>,
): void {
  enqueuePersistenceSave({
    projectSlug,
    resourceKey,
    data,
    save: save as (slug: string, d: unknown) => Promise<void>,
    errorMessage: `Failed to save ${resourceKey}.`,
  });
}
