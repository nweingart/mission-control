import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { persistFireAndForget } from '../../../src/utils/persist';

describe('persistFireAndForget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls saveFn and does not retry on success', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn();

    persistFireAndForget(saveFn, set, 'test');

    // Flush the microtask
    await vi.runAllTimersAsync();

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(set).not.toHaveBeenCalled();
  });

  it('retries once after failure and succeeds', async () => {
    const saveFn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(undefined);
    const set = vi.fn();

    persistFireAndForget(saveFn, set, 'test');

    // First call rejects
    await vi.advanceTimersByTimeAsync(0);

    // Retry happens after 500ms
    await vi.advanceTimersByTimeAsync(500);

    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(set).not.toHaveBeenCalled();
  });

  it('sets saveError after retry also fails', async () => {
    const saveFn = vi.fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'));
    const set = vi.fn();

    persistFireAndForget(saveFn, set, 'tasks');

    // First call rejects
    await vi.advanceTimersByTimeAsync(0);

    // Retry after 500ms also rejects
    await vi.advanceTimersByTimeAsync(500);

    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenCalledWith({
      saveError: 'Failed to save tasks. Your changes may not persist.',
    });
  });
});
