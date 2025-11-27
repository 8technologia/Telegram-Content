import { OpenRouter } from '@openrouter/sdk';
import configManager from '../../config/configManager';
import logger from '../../utils/logger';
import { withTimeout } from '../../utils/timeout';

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

class OpenRouterService {
  public client: OpenRouter;

  constructor() {
    const config = configManager.getConfig();
    this.client = new OpenRouter({
      apiKey: config.ai.openRouter.apiKey,
    });

    logger.info('OpenRouter service initialized');
  }

  /**
   * Generate completion with OpenRouter
   */
  async generateCompletion(prompt: string, maxTokens?: number, timeout?: number): Promise<{
    content: string;
    tokensUsed: number;
    inputTokens: number;
    outputTokens: number;
  }> {
    const startTime = Date.now();
    const config = configManager.getConfig();
    const timeoutMs = timeout || config.rateLimit.aiRequestTimeout;

    try {
      const messages: OpenRouterMessage[] = [
        {
          role: 'user',
          content: prompt,
        },
      ];

      // OpenRouter API call - non-streaming
      const apiCall = this.client.chat.send({
        model: config.ai.openRouter.model,
        messages,
        temperature: config.ai.temperature,
        maxTokens: maxTokens,
        stream: false,
      });

      // Wrap with timeout
      const response: any = await withTimeout(apiCall, timeoutMs, 'OpenRouter API');
      const processingTime = Date.now() - startTime;

      // Extract content from response
      const content = response.choices?.[0]?.message?.content || '';
      const usage = response.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      const inputTokens = usage.promptTokens || usage.prompt_tokens || 0;
      const outputTokens = usage.completionTokens || usage.completion_tokens || 0;
      const tokensUsed = usage.totalTokens || usage.total_tokens || 0;

      logger.info(`OpenRouter completion generated in ${processingTime}ms, tokens: ${tokensUsed} (in: ${inputTokens}, out: ${outputTokens}), max_tokens: ${maxTokens || 'default'}`);

      return { content, tokensUsed, inputTokens, outputTokens };
    } catch (error: any) {
      if (error.message?.includes('timeout')) {
        logger.error(`OpenRouter API timeout: ${error.message}`);
        throw new Error(`OpenRouter API timeout after ${timeoutMs / 1000}s`);
      }
      if (error.response) {
        logger.error(`OpenRouter API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        throw new Error(`OpenRouter API error: ${error.response.status}`);
      }

      // Enhanced error logging for network/socket errors
      const errorType = error.code || error.name || 'Unknown';
      const errorDetails = {
        message: error.message,
        code: error.code,
        cause: error.cause?.message,
        socket: error.cause?.socket
      };

      logger.error(`OpenRouter request error [${errorType}]: ${JSON.stringify(errorDetails)}`);
      throw new Error(`OpenRouter request error: ${error.message}`);
    }
  }

  /**
   * Parse JSON response from OpenRouter with multiple fallback strategies
   */
  parseJSONResponse<T>(content: string): T {
    try {
      // Strategy 1: Extract JSON from markdown code blocks
      const codeBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        const jsonString = codeBlockMatch[1].trim();
        return JSON.parse(jsonString);
      }

      // Strategy 2: Try to parse the entire content as-is
      try {
        return JSON.parse(content.trim());
      } catch {
        // Continue to strategy 3
      }

      // Strategy 3: Extract JSON object from text (find first { and last })
      const firstBrace = content.indexOf('{');
      const lastBrace = content.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonString = content.substring(firstBrace, lastBrace + 1);
        return JSON.parse(jsonString);
      }

      // Strategy 4: Try to find JSON array [...]
      const firstBracket = content.indexOf('[');
      const lastBracket = content.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        const jsonString = content.substring(firstBracket, lastBracket + 1);
        return JSON.parse(jsonString);
      }

      // All strategies failed
      throw new Error('No valid JSON found in response');
    } catch (error) {
      logger.error('Failed to parse OpenRouter JSON response');
      logger.error(`Response content (first 500 chars): ${content.substring(0, 500)}`);
      throw new Error('Invalid JSON response from OpenRouter');
    }
  }

  /**
   * Generate and parse JSON completion
   */
  async generateJSONCompletion<T>(prompt: string, maxTokens?: number, timeout?: number): Promise<{
    data: T;
    tokensUsed: number;
    inputTokens: number;
    outputTokens: number;
  }> {
    const { content, tokensUsed, inputTokens, outputTokens } = await this.generateCompletion(prompt, maxTokens, timeout);
    const data = this.parseJSONResponse<T>(content);
    return { data, tokensUsed, inputTokens, outputTokens };
  }
}

export default new OpenRouterService();
