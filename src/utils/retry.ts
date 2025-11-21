import { Logger } from './logger';

/**
 * Execute a function without retry - fail fast on first error
 * Previously supported retry with backoff, but timeout retries take too long
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  _maxRetries: number = 1,
  _initialDelay: number = 1000,
  context: string = 'Request'
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const err = error as Error;
    Logger.error(`[${context}] Request failed: ${err.message}`);
    throw err;
  }
}
