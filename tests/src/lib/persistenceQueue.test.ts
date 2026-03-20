import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  enqueuePersistenceSave,
  configurePersistenceQueue,
  retryAllPendingSaves,
} from '../../../src/lib/persistenceQueue';

describe('persistenceQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset handlers
    configurePersistenceQueue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces rapid saves into a single write', async () => {
    const save = vi.fn().mockResolvedValue(undefined);

    // Enqueue 5 rapid saves
    for (let i = 0; i < 5; i++) {
      enqueuePersistenceSave({
        projectSlug: 'proj',
        resourceKey: 'tasks',
        data: { version: i },
        save,
        errorMessage: 'save failed',
      });
    }

    // Advance past debounce (250ms default)
    await vi.advanceTimersByTimeAsync(300);

    // Should have been called once with the last data
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('proj', { version: 4 });
  });

  it('keeps different resource keys independent', async () => {
    const saveTasks = vi.fn().mockResolvedValue(undefined);
    const saveChat = vi.fn().mockResolvedValue(undefined);

    enqueuePersistenceSave({
      projectSlug: 'proj',
      resourceKey: 'tasks',
      data: [1, 2, 3],
      save: saveTasks,
      errorMessage: 'tasks failed',
    });

    enqueuePersistenceSave({
      projectSlug: 'proj',
      resourceKey: 'chat',
      data: ['hello'],
      save: saveChat,
      errorMessage: 'chat failed',
    });

    await vi.advanceTimersByTimeAsync(300);

    expect(saveTasks).toHaveBeenCalledTimes(1);
    expect(saveChat).toHaveBeenCalledTimes(1);
  });

  it('retries on failure with exponential backoff', async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new Error('disk error'))
      .mockResolvedValueOnce(undefined);

    const onError = vi.fn();
    configurePersistenceQueue({ onError });

    enqueuePersistenceSave({
      projectSlug: 'proj',
      resourceKey: 'tasks',
      data: [1],
      save,
      errorMessage: 'save failed',
    });

    // First attempt after debounce
    await vi.advanceTimersByTimeAsync(300);
    expect(save).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('save failed Retrying in background.');

    // Retry after 500ms backoff
    await vi.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('calls onPendingChange when entries are added and removed', async () => {
    const onPendingChange = vi.fn();
    configurePersistenceQueue({ onPendingChange });

    const save = vi.fn().mockResolvedValue(undefined);

    enqueuePersistenceSave({
      projectSlug: 'proj',
      resourceKey: 'tasks',
      data: [],
      save,
      errorMessage: 'failed',
    });

    // Should have been called when entry was added
    expect(onPendingChange).toHaveBeenCalledWith(true, 1);

    // Flush
    await vi.advanceTimersByTimeAsync(300);

    // Should have been called when entry was removed
    expect(onPendingChange).toHaveBeenCalledWith(false, 0);
  });

  it('flushes new data that arrived during in-flight write', async () => {
    let resolveFirst: (() => void) | null = null;
    const save = vi.fn().mockImplementationOnce(() => {
      return new Promise<void>((resolve) => { resolveFirst = resolve; });
    }).mockResolvedValue(undefined);

    enqueuePersistenceSave({
      projectSlug: 'proj',
      resourceKey: 'tasks',
      data: { v: 1 },
      save,
      errorMessage: 'failed',
    });

    // Trigger first flush
    await vi.advanceTimersByTimeAsync(300);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('proj', { v: 1 });

    // While first write is in-flight, enqueue new data
    enqueuePersistenceSave({
      projectSlug: 'proj',
      resourceKey: 'tasks',
      data: { v: 2 },
      save,
      errorMessage: 'failed',
    });

    // Resolve first write
    resolveFirst!();
    await vi.advanceTimersByTimeAsync(0); // let microtasks run

    // Should schedule another flush for the new data
    await vi.advanceTimersByTimeAsync(300);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('proj', { v: 2 });
  });
});
