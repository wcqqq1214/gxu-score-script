import { setTimeout } from "node:timers/promises";
import { recordRetry, taskSignal } from "./runtime.js";

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
    taskSignal.throwIfAborted();
    try {
      const result = await fn();
      taskSignal.throwIfAborted();
      return result;
    } catch (error) {
      if (taskSignal.aborted) throw error;
      lastError = error;
      if (attempt < opts.maxAttempts) {
        recordRetry();
        opts.onRetry(attempt, error);
        await setTimeout(opts.delayMs, undefined, { signal: taskSignal });
      }
    }
  }

  throw lastError;
}
