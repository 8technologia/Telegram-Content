import { config } from '../config';
import logger from './logger';
import { RateLimitInfo } from '../types';

class RateLimiter {
  private limits: Map<string, RateLimitInfo> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);

    logger.info('Rate limiter initialized');
  }

  /**
   * Check if user has exceeded rate limit
   */
  checkLimit(userId: string): { allowed: boolean; retryAfter?: number } {
    if (!config.rateLimit.enabled) {
      return { allowed: true };
    }

    const now = Date.now();
    const windowDuration = 60000; // 1 minute

    let userLimit = this.limits.get(userId);

    if (!userLimit) {
      userLimit = {
        userId,
        requestCount: 0,
        windowStart: now,
      };
      this.limits.set(userId, userLimit);
    }

    // Reset window if expired
    if (now - userLimit.windowStart >= windowDuration) {
      userLimit.requestCount = 0;
      userLimit.windowStart = now;
    }

    // Check if limit exceeded
    if (userLimit.requestCount >= config.rateLimit.maxRequestsPerMinute) {
      const retryAfter = Math.ceil((windowDuration - (now - userLimit.windowStart)) / 1000);
      logger.warn(`Rate limit exceeded for user ${userId}`);
      return { allowed: false, retryAfter };
    }

    // Increment counter
    userLimit.requestCount++;
    return { allowed: true };
  }

  /**
   * Reset limit for a user
   */
  resetLimit(userId: string): void {
    this.limits.delete(userId);
    logger.debug(`Rate limit reset for user ${userId}`);
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const windowDuration = 60000;
    let cleanedCount = 0;

    for (const [userId, limit] of this.limits.entries()) {
      if (now - limit.windowStart >= windowDuration * 2) {
        this.limits.delete(userId);
        cleanedCount++;
      }
    }

    // Only log if something was actually cleaned up
    if (cleanedCount > 0) {
      logger.debug(`Rate limiter cleanup: removed ${cleanedCount} expired entries`);
    }
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      trackedUsers: this.limits.size,
      enabled: config.rateLimit.enabled,
      maxRequestsPerMinute: config.rateLimit.maxRequestsPerMinute,
    };
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

export default new RateLimiter();
