export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export function jitter(delayMs: number): number {
  return Math.round(delayMs * (0.5 + Math.random() * 0.5));
}

export function exponentialBackoff(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
  return jitter(delay);
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
  signal: AbortSignal,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (signal.aborted) throw err;
      lastError = err;

      if (attempt < options.maxRetries && !isFatal(err)) {
        const delay = exponentialBackoff(attempt, options.baseDelayMs, options.maxDelayMs);
        await sleep(delay, signal);
      }
    }
  }

  throw lastError;
}

function isFatal(err: unknown): boolean {
  if (err instanceof Error && 'status' in err) {
    const status = (err as { status: number }).status;
    if (status === 401 || status === 403 || status === 400) return true;
  }
  return false;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const onAbort = () => { clearTimeout(id); resolve(); };
    const id = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    if (signal.aborted) { clearTimeout(id); resolve(); return; }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
