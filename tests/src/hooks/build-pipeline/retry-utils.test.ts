import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryWithBackoff, retryOnTimeout } from '../../../../src/hooks/build-pipeline/retry-utils';

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns result on first successful call', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retryWithBackoff(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries and succeeds on second attempt', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('ok');

    const promise = retryWithBackoff(fn, 3, 100);
    // Advance past the backoff delay (100ms * 2^0 = 100ms)
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting all retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));

    const promise = retryWithBackoff(fn, 2, 100);
    // Advance past all backoff delays
    await vi.advanceTimersByTimeAsync(10000);

    await expect(promise).rejects.toThrow('persistent failure');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});

describe('retryOnTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns result when no timeout occurs', async () => {
    const fn = vi.fn().mockResolvedValue('done');
    const result = await retryOnTimeout(fn);
    expect(result).toBe('done');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on timeout error', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('no output for 30s'))
      .mockResolvedValueOnce('recovered');

    const promise = retryOnTimeout(fn, 2, 'test-task');
    await vi.advanceTimersByTimeAsync(10000);
    const result = await promise;
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws non-timeout errors immediately', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('auth failed'));
    await expect(retryOnTimeout(fn)).rejects.toThrow('auth failed');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
