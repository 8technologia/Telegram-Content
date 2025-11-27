import Anthropic from '@anthropic-ai/sdk';
import configManager from '../../config/configManager';
import logger from '../../utils/logger';
import { withTimeout } from '../../utils/timeout';

class ClaudeService {
  public client: Anthropic;

  constructor() {
    const config = configManager.getConfig();
    this.client = new Anthropic({
      apiKey: config.ai.claude.apiKey,
    });
    logger.info('Claude service initialized');
  }

  /**
   * Generate completion with Claude
   */
  async generateCompletion(prompt: string, maxTokens?: number, timeout?: number): Promise<{
    content: string;
    tokensUsed: number;
    inputTokens: number;
    outputTokens: number;
  }> {
    const startTime = Date.now();
    const config = configManager.getConfig();
    const tokens = maxTokens || config.ai.claude.articleMaxTokens; // Default to article max
    const timeoutMs = timeout || config.rateLimit.aiRequestTimeout;

    try {

      const apiCall = this.client.messages.create({
        model: config.ai.claude.model,
        max_tokens: tokens,
        temperature: config.ai.temperature,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Wrap with timeout
      const response = await withTimeout(apiCall, timeoutMs, 'Claude API');

      const processingTime = Date.now() - startTime;

      const content = response.content[0].type === 'text' ? response.content[0].text : '';
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const tokensUsed = inputTokens + outputTokens;

      logger.info(`Claude completion generated in ${processingTime}ms, tokens: ${tokensUsed} (in: ${inputTokens}, out: ${outputTokens}), max_tokens: ${tokens}`);

      return { content, tokensUsed, inputTokens, outputTokens };
    } catch (error: any) {
      if (error.message?.includes('timeout')) {
        logger.error(`Claude API timeout: ${error.message}`);
        throw new Error(`Claude API timeout after ${timeoutMs / 1000}s`);
      }
      logger.error(`Claude API error: ${error.message}`);
      throw new Error(`Claude API error: ${error.message}`);
    }
  }

  /**
   * Parse JSON response from Claude with multiple fallback strategies
   */
  parseJSONResponse<T>(content: string): T {
    const errors: string[] = [];

    // Strategy 1: Extract JSON from markdown code blocks
    try {
      const codeBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        const jsonString = codeBlockMatch[1].trim();
        return JSON.parse(jsonString);
      }
      logger.debug('Strategy 1 (code block): No code block found');
      errors.push('Strategy 1: No code block found');
    } catch (e: any) {
      logger.debug(`Strategy 1 (code block) failed: ${e.message}`);
      errors.push(`Strategy 1: ${e.message}`);
    }

    // Strategy 2: Try to parse the entire content as-is
    try {
      return JSON.parse(content.trim());
    } catch (e: any) {
      logger.debug(`Strategy 2 (direct parse) failed: ${e.message}`);
      errors.push(`Strategy 2: ${e.message}`);
    }

    // Strategy 3: Extract JSON object from text (find first { and last })
    try {
      const firstBrace = content.indexOf('{');
      const lastBrace = content.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonString = content.substring(firstBrace, lastBrace + 1);
        return JSON.parse(jsonString);
      }
      logger.debug('Strategy 3 (extract object): No valid braces found');
      errors.push('Strategy 3: No valid braces found');
    } catch (e: any) {
      logger.debug(`Strategy 3 (extract object) failed: ${e.message}`);
      errors.push(`Strategy 3: ${e.message}`);
    }

    // Strategy 4: Try to find JSON array [...]
    try {
      const firstBracket = content.indexOf('[');
      const lastBracket = content.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        const jsonString = content.substring(firstBracket, lastBracket + 1);
        return JSON.parse(jsonString);
      }
      logger.debug('Strategy 4 (extract array): No valid brackets found');
      errors.push('Strategy 4: No valid brackets found');
    } catch (e: any) {
      logger.debug(`Strategy 4 (extract array) failed: ${e.message}`);
      errors.push(`Strategy 4: ${e.message}`);
    }

    // All strategies failed - log detailed error
    logger.error('Failed to parse Claude JSON response - all strategies failed');
    logger.error(`Strategy errors: ${errors.join(' | ')}`);
    logger.error(`Response content (first 500 chars): ${content.substring(0, 500)}`);
    throw new Error('Invalid JSON response from Claude');
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

export default new ClaudeService();
