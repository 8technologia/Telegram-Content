import logger from './logger';

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  taskName?: string;
}

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param options Retry options
 * @returns Result from the function
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 3000, // Default to 3000ms (3s) as requested by user
    maxDelay = 3000, // Default to 3000ms (3s) as requested by user (no exponential backoff)
    taskName = 'operation',
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      if (attempt < maxRetries) {
        // Calculate delay. Use fixed delay if maxDelay equals baseDelay, otherwise use exponential backoff.
        const delay = (baseDelay === maxDelay) ? baseDelay : Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        logger.warn(
          `${taskName} failed (attempt ${attempt + 1}/${maxRetries + 1}): ${error.message}. Retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        logger.error(`${taskName} failed after ${maxRetries + 1} attempts: ${error.message}`);
      }
    }
  }

  throw lastError || new Error(`${taskName} failed after ${maxRetries + 1} attempts`);
}
