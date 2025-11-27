import { config } from '../config';
import logger from './logger';

/**
 * Wrap a promise with a timeout
 * @param promise The promise to wrap
 * @param timeoutMs Timeout in milliseconds (defaults to AI_REQUEST_TIMEOUT from config)
 * @param taskName Name of the task for logging
 * @returns The promise result or throws timeout error
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs?: number,
  taskName?: string
): Promise<T> {
  const timeout = timeoutMs || config.rateLimit.aiRequestTimeout;
  const taskLabel = taskName || 'AI request';

  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`${taskLabel} timeout after ${timeout / 1000}s`);
      logger.error(`Timeout: ${taskLabel} exceeded ${timeout}ms`);
      reject(error);
    }, timeout);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}
