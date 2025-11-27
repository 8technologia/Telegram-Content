import claudeService from './claudeService';
import openRouterService from './openRouterService';
import configManager from '../../config/configManager';
import logger from '../../utils/logger';
import { AIResponse } from '../../types';

class AIRouter {
  /**
   * Get max tokens based on task type
   *
   * Note: Both Claude and OpenRouter use the same model (Claude Sonnet 4.5),
   * so we reuse Claude's maxTokens configuration for both providers.
   */
  private getMaxTokens(taskType: 'titles' | 'outline' | 'article'): number {
    const config = configManager.getConfig();
    if (taskType === 'titles') return config.ai.claude.titleMaxTokens;
    if (taskType === 'outline') return config.ai.claude.outlineMaxTokens;
    if (taskType === 'article') return config.ai.claude.articleMaxTokens;
    return config.ai.claude.articleMaxTokens;
  }

  /**
   * Get timeout based on task type
   */
  private getTimeout(taskType: 'titles' | 'outline' | 'article'): number {
    const config = configManager.getConfig();
    if (taskType === 'titles' && config.rateLimit.aiTitleTimeout) {
      return config.rateLimit.aiTitleTimeout;
    }
    if (taskType === 'outline' && config.rateLimit.aiOutlineTimeout) {
      return config.rateLimit.aiOutlineTimeout;
    }
    if (taskType === 'article' && config.rateLimit.aiArticleTimeout) {
      return config.rateLimit.aiArticleTimeout;
    }
    // Fallback to default AI request timeout
    return config.rateLimit.aiRequestTimeout;
  }

  /**
   * Try a provider with exponential backoff retry (3 attempts)
   */
  private async tryProviderWithRetry<T>(
    provider: 'claude' | 'openrouter',
    prompt: string,
    maxTokens: number,
    timeout: number,
    maxRetries: number = 3
  ): Promise<{
    data: T;
    tokensUsed: number;
    inputTokens: number;
    outputTokens: number;
  }> {
    let lastError: any;

    logger.info(`Starting ${provider} with retry logic (max ${maxRetries} attempts)`);
    logger.debug(`Request config - maxTokens: ${maxTokens}, timeout: ${timeout / 1000}s`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const attemptStartTime = Date.now();

      try {
        logger.info(`[${provider}] Attempt ${attempt}/${maxRetries} starting...`);

        const result = provider === 'claude'
          ? await claudeService.generateJSONCompletion<T>(prompt, maxTokens, timeout)
          : await openRouterService.generateJSONCompletion<T>(prompt, maxTokens, timeout);

        const attemptDuration = Date.now() - attemptStartTime;
        logger.info(`✅ [${provider}] Attempt ${attempt}/${maxRetries} succeeded in ${attemptDuration}ms`);
        logger.info(`Tokens used: ${result.tokensUsed} (input: ${result.inputTokens}, output: ${result.outputTokens})`);

        return result;
      } catch (error: any) {
        lastError = error;
        const attemptDuration = Date.now() - attemptStartTime;
        logger.error(`❌ [${provider}] Attempt ${attempt}/${maxRetries} failed after ${attemptDuration}ms`);
        logger.error(`Error: ${error.message}`);

        // If not the last attempt, wait before retrying with exponential backoff
        if (attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          logger.info(`⏳ Retrying ${provider} in ${delayMs / 1000}s... (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          logger.error(`[${provider}] All ${maxRetries} attempts exhausted`);
        }
      }
    }

    // All retries failed
    logger.error(`[${provider}] Final error after ${maxRetries} attempts: ${lastError.message}`);
    throw lastError;
  }

  /**
   * Try primary provider with retry on transient errors (2 attempts)
   */
  private async tryPrimaryProvider<T>(
    provider: 'claude' | 'openrouter',
    prompt: string,
    maxTokens: number,
    timeout: number
  ): Promise<{
    data: T;
    tokensUsed: number;
    inputTokens: number;
    outputTokens: number;
  } | null> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = provider === 'claude'
          ? await claudeService.generateJSONCompletion<T>(prompt, maxTokens, timeout)
          : await openRouterService.generateJSONCompletion<T>(prompt, maxTokens, timeout);

        return result;
      } catch (error: any) {
        const errorMsg = error.message?.toLowerCase() || '';

        // Identify transient errors that should be retried
        const isConnectionError = errorMsg.includes('connection');
        const isTerminatedError = errorMsg.includes('terminated') || errorMsg.includes('socket');
        const isRateLimitError = errorMsg.includes('rate limit') || errorMsg.includes('429');
        const isServerError = errorMsg.includes('500') || errorMsg.includes('502') || errorMsg.includes('503');
        const isTransientError = isConnectionError || isTerminatedError || isRateLimitError || isServerError;

        // Retry on transient errors on first attempt
        if (attempt === 1 && isTransientError) {
          const delayMs = 2000; // 2 second delay before retry
          logger.warn(`${provider} transient error on attempt ${attempt}/2: ${error.message}, retrying in ${delayMs / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }

        // Don't retry on timeout, parse errors, non-transient errors, or second attempt
        logger.error(`${provider} attempt ${attempt}/2 failed: ${error.message}`);
        throw error;
      }
    }

    return null; // Should not reach here
  }

  /**
   * Generate JSON completion with dynamic primary/backup provider selection
   */
  async generateJSON<T>(
    prompt: string,
    taskType: 'titles' | 'outline' | 'article'
  ): Promise<AIResponse<T>> {
    const startTime = Date.now();

    // Determine primary and backup providers based on config
    const config = configManager.getConfig();
    const primaryProvider = config.ai.defaultProvider;
    const backupProvider: 'claude' | 'openrouter' = primaryProvider === 'claude' ? 'openrouter' : 'claude';

    logger.info('='.repeat(50));
    logger.info(`AI REQUEST - ${taskType.toUpperCase()}`);
    logger.info('='.repeat(50));
    logger.info(`Primary provider: ${primaryProvider}`);
    logger.info(`Backup provider: ${backupProvider} (${config.ai.backupAI ? 'enabled' : 'disabled'})`);

    // Get max tokens and timeout based on task type
    const maxTokens = this.getMaxTokens(taskType);
    const timeout = this.getTimeout(taskType);

    logger.info(`Task config - maxTokens: ${maxTokens}, timeout: ${timeout / 1000}s`);
    logger.debug(`Prompt length: ${prompt.length} characters`);

    let primaryError: any;

    // Try primary provider with retry on connection errors
    logger.info(`Starting request with primary provider: ${primaryProvider}`);
    try {
      const result = await this.tryPrimaryProvider<T>(primaryProvider, prompt, maxTokens, timeout);

      if (result) {
        const processingTime = Date.now() - startTime;

        logger.info('='.repeat(50));
        logger.info(`✅ PRIMARY PROVIDER SUCCESS - ${primaryProvider}`);
        logger.info(`Processing time: ${processingTime}ms`);
        logger.info(`Tokens: ${result.tokensUsed} (in: ${result.inputTokens}, out: ${result.outputTokens})`);
        logger.info('='.repeat(50));

        return {
          data: result.data,
          provider: primaryProvider,
          tokensUsed: result.tokensUsed,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          cached: false,
          processingTime,
        };
      }
    } catch (error: any) {
      primaryError = error;
      logger.error('='.repeat(50));
      logger.error(`❌ PRIMARY PROVIDER FAILED - ${primaryProvider}`);
      logger.error(`Error: ${primaryError.message}`);
      logger.error(`Error stack: ${primaryError.stack}`);
      logger.error('='.repeat(50));
    }

    // Primary provider failed, try backup if enabled
    if (config.ai.backupAI) {
      logger.warn('='.repeat(50));
      logger.warn(`⚠️  INITIATING BACKUP FAILOVER TO ${backupProvider.toUpperCase()}`);
      logger.warn('='.repeat(50));

      try {
        // Try backup provider with 3 retries and exponential backoff
        const backupResult = await this.tryProviderWithRetry<T>(
          backupProvider,
          prompt,
          maxTokens,
          timeout,
          3 // 3 retry attempts
        );

        const processingTime = Date.now() - startTime;

        logger.info('='.repeat(50));
        logger.info(`✅ BACKUP PROVIDER SUCCESS - ${backupProvider}`);
        logger.info(`Processing time: ${processingTime}ms`);
        logger.info(`Tokens: ${backupResult.tokensUsed} (in: ${backupResult.inputTokens}, out: ${backupResult.outputTokens})`);
        logger.info('='.repeat(50));

        return {
          data: backupResult.data,
          provider: backupProvider,
          tokensUsed: backupResult.tokensUsed,
          inputTokens: backupResult.inputTokens,
          outputTokens: backupResult.outputTokens,
          cached: false,
          processingTime,
        };
      } catch (backupError: any) {
        logger.error('='.repeat(50));
        logger.error(`❌ BACKUP PROVIDER FAILED - ${backupProvider}`);
        logger.error(`Error: ${backupError.message}`);
        logger.error('='.repeat(50));
        logger.error('💥 ALL AI PROVIDERS EXHAUSTED - REQUEST FAILED');
        logger.error('='.repeat(50));

        const combinedError = new Error(
          `All AI providers failed. ${primaryProvider}: ${primaryError.message}, ${backupProvider}: ${backupError.message}`
        );
        logger.error(`Combined error: ${combinedError.message}`);
        throw combinedError;
      }
    }

    // Backup not enabled, throw primary error
    logger.error('='.repeat(50));
    logger.error('❌ REQUEST FAILED - Backup AI is disabled');
    logger.error(`Primary provider error: ${primaryError.message}`);
    logger.error('='.repeat(50));
    throw primaryError;
  }
}

export default new AIRouter();
