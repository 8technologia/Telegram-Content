import { ConversationState } from '../../types';
import logger from '../../utils/logger';

interface LockInfo {
  promise: Promise<void>;
  timestamp: number;
}

class ConversationManager {
  private conversations: Map<string, ConversationState> = new Map();
  private locks: Map<string, LockInfo> = new Map();
  private cleanupInterval: NodeJS.Timeout;
  private lockTimeoutMs = 600000; // 10 minutes - max time a lock can be held
  private lockPromiseTimeoutMs = 300000; // 5 minutes - max time a lock promise can exist

  constructor() {
    // Cleanup inactive conversations every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
      this.cleanupStaleLocks();
      this.cleanupOldLockPromises();
    }, 300000);

    logger.info('Conversation manager initialized');
  }

  /**
   * Get conversation key
   */
  private getKey(userId: string, chatId: number): string {
    return `${userId}:${chatId}`;
  }

  /**
   * Get or create conversation state
   */
  getConversation(userId: string, chatId: number): ConversationState {
    const key = this.getKey(userId, chatId);
    let conversation = this.conversations.get(key);

    if (!conversation) {
      conversation = {
        userId,
        chatId,
        step: 'idle',
        lastActivity: new Date(),
      };
      this.conversations.set(key, conversation);
      logger.debug(`Created new conversation for ${key}`);
    }

    // Update last activity
    conversation.lastActivity = new Date();
    return conversation;
  }

  /**
   * Update conversation state
   */
  updateConversation(userId: string, chatId: number, updates: Partial<ConversationState>): void {
    const key = this.getKey(userId, chatId);
    const conversation = this.getConversation(userId, chatId);

    Object.assign(conversation, updates, { lastActivity: new Date() });
    this.conversations.set(key, conversation);

    logger.debug(`Updated conversation ${key} to step: ${conversation.step}`);
  }

  /**
   * Try to acquire processing lock atomically
   * Returns true if lock was acquired, false if already locked
   *
   * This implementation ensures true atomicity by checking and setting
   * the lock in a synchronous manner
   */
  async tryAcquireLock(
    userId: string,
    chatId: number,
    task: 'titles' | 'outline' | 'article'
  ): Promise<boolean> {
    const key = this.getKey(userId, chatId);

    // Wait for any pending lock operations to complete
    const pendingLockInfo = this.locks.get(key);
    if (pendingLockInfo) {
      try {
        await pendingLockInfo.promise;
      } catch (error) {
        // Ignore errors from previous lock operations
      }
      // After waiting, cleanup the old lock promise
      this.locks.delete(key);
    }

    // Synchronously check and acquire lock to prevent race condition
    const conversation = this.getConversation(userId, chatId);

    // Check if already processing
    if (conversation.isProcessing) {
      logger.warn(`Lock acquisition failed for ${key} - already processing ${conversation.processingTask}`);
      return false;
    }

    // Acquire lock synchronously
    conversation.isProcessing = true;
    conversation.processingTask = task;
    conversation.lockAcquiredAt = new Date();
    conversation.lastActivity = new Date();
    logger.debug(`Lock acquired for ${key} - task: ${task}`);

    return true;
  }

  /**
   * Release processing lock
   */
  releaseLock(userId: string, chatId: number): void {
    const key = this.getKey(userId, chatId);
    const conversation = this.conversations.get(key);

    if (conversation) {
      conversation.isProcessing = false;
      conversation.processingTask = undefined;
      conversation.lockAcquiredAt = undefined;
      conversation.lastActivity = new Date();
      logger.debug(`Lock released for ${key}`);
    }

    // Also cleanup lock promise if exists
    this.locks.delete(key);
  }

  /**
   * Reset conversation to idle
   */
  resetConversation(userId: string, chatId: number): void {
    const key = this.getKey(userId, chatId);
    this.conversations.delete(key);
    this.locks.delete(key);
    logger.debug(`Reset conversation ${key}`);
  }

  /**
   * Cleanup inactive conversations (older than 1 hour)
   */
  private cleanup(): void {
    const now = Date.now();
    const timeout = 3600000; // 1 hour

    for (const [key, conversation] of this.conversations.entries()) {
      if (now - conversation.lastActivity.getTime() > timeout) {
        this.conversations.delete(key);
        this.locks.delete(key);
        logger.debug(`Cleaned up inactive conversation ${key}`);
      }
    }
  }

  /**
   * Cleanup stale locks (locks held longer than timeout)
   */
  private cleanupStaleLocks(): void {
    const now = Date.now();

    for (const [key, conversation] of this.conversations.entries()) {
      if (
        conversation.isProcessing &&
        conversation.lockAcquiredAt &&
        now - conversation.lockAcquiredAt.getTime() > this.lockTimeoutMs
      ) {
        logger.warn(`Releasing stale lock for ${key} - task: ${conversation.processingTask}, held for ${Math.round((now - conversation.lockAcquiredAt.getTime()) / 1000)}s`);

        conversation.isProcessing = false;
        conversation.processingTask = undefined;
        conversation.lockAcquiredAt = undefined;
        conversation.lastActivity = new Date();

        // Cleanup lock promise too
        this.locks.delete(key);
      }
    }
  }

  /**
   * Cleanup old lock promises that are no longer needed
   * This prevents memory leaks from abandoned lock promises
   */
  private cleanupOldLockPromises(): void {
    const now = Date.now();

    for (const [key, lockInfo] of this.locks.entries()) {
      // If lock promise is older than threshold, remove it
      if (now - lockInfo.timestamp > this.lockPromiseTimeoutMs) {
        logger.debug(`Cleaning up old lock promise for ${key}`);
        this.locks.delete(key);
      }
    }
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      activeConversations: this.conversations.size,
      activeLocks: this.locks.size,
      conversations: Array.from(this.conversations.values()).map((c) => ({
        userId: c.userId,
        chatId: c.chatId,
        step: c.step,
        lastActivity: c.lastActivity,
      })),
    };
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.conversations.clear();
    this.locks.clear();
  }
}

export default new ConversationManager();
