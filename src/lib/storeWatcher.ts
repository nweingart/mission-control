import { useAppStore } from '../store/useAppStore';

type AppState = ReturnType<typeof useAppStore.getState>;

/**
 * Wait for a store condition to become true.
 * Subscribes to zustand store, resolves when predicate returns true, rejects on timeout.
 */
export function waitForStore(
  predicate: (state: AppState) => boolean,
  timeoutMs: number,
  description: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check immediately
    if (predicate(useAppStore.getState())) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      unsub();
      reject(new Error(`Timeout (${(timeoutMs / 1000).toFixed(0)}s): ${description}`));
    }, timeoutMs);

    const unsub = useAppStore.subscribe((state) => {
      if (predicate(state)) {
        clearTimeout(timeout);
        unsub();
        resolve();
      }
    });
  });
}

/**
 * Wait for a store value to change and return the new value.
 */
export function waitForStoreValue<T>(
  selector: (state: AppState) => T,
  predicate: (value: T) => boolean,
  timeoutMs: number,
  description: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const current = selector(useAppStore.getState());
    if (predicate(current)) {
      resolve(current);
      return;
    }

    const timeout = setTimeout(() => {
      unsub();
      reject(new Error(`Timeout (${(timeoutMs / 1000).toFixed(0)}s): ${description}`));
    }, timeoutMs);

    const unsub = useAppStore.subscribe((state) => {
      const value = selector(state);
      if (predicate(value)) {
        clearTimeout(timeout);
        unsub();
        resolve(value);
      }
    });
  });
}
