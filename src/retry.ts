interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  onRetry: (attempt: number, error: unknown) => void;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  delayMs: 5000,
  onRetry: () => {},
};

export async function retry<T>(fn: () => Promise<T>, options?: Partial<RetryOptions>): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < opts.maxAttempts) {
        opts.onRetry(attempt, error);
        await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
      }
    }
  }

  throw lastError;
}
