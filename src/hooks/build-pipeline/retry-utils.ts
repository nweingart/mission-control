export async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3, baseMs = 500): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === maxRetries) throw err;
      await new Promise(r => setTimeout(r, baseMs * Math.pow(2, i)));
    }
  }
  throw new Error('unreachable');
}

export async function retryOnTimeout<T>(
  fn: () => Promise<T>, maxRetries = 2, label = ''
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await fn(); }
    catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      // Match timeout errors by message content (these come from claude-code.ts which
      // we don't control the error format of — if that changes, classifyError() will
      // still catch it via the CLAUDE_TIMEOUT code path)
      const isTimeout = msg.includes('no output for') || msg.includes('timed out');
      if (!isTimeout || attempt === maxRetries) throw err;
      console.log(`[BuildPipeline] Timeout on ${label}, retry ${attempt + 1}/${maxRetries}`);
      await new Promise(r => setTimeout(r, 5000 * (attempt + 1)));
    }
  }
  throw new Error('unreachable');
}
