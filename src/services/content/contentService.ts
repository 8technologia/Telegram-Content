import aiRouter from '../ai/aiRouter';
import { generateTitlePrompt } from '../../prompts/titleGenerator';
import { generateOutlinePrompt } from '../../prompts/outlineGenerator';
import { generateArticlePrompt } from '../../prompts/articleGenerator';
import { ArticleTitlesResponse, OutlineResponse, ArticleResponse, AIResponse, ArticleOutline } from '../../types';
import { validateOutline } from '../../utils/validation';
import logger from '../../utils/logger';

class ContentService {
  /**
   * Generate article titles
   */
  async generateTitles(topic: string, _userId: string): Promise<AIResponse<ArticleTitlesResponse>> {
    logger.info(`Generating titles for topic: ${topic}`);

    const prompt = generateTitlePrompt(topic);

    try {
      const response = await aiRouter.generateJSON<{ titles: Array<{ titleNumber: string; title: string }> }>(
        prompt,
        'titles'
      );

      const titlesResponse: ArticleTitlesResponse = {
        titles: response.data.titles,
        provider: response.provider,
        tokensUsed: response.tokensUsed,
      };

      return {
        data: titlesResponse,
        provider: response.provider,
        tokensUsed: response.tokensUsed,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cached: response.cached,
        processingTime: response.processingTime,
      };
    } catch (error: any) {
      logger.error(`Failed to generate titles: ${error.message}`);
      throw new Error(`Failed to generate titles: ${error.message}`);
    }
  }

  /**
   * Generate article outline
   */
  async generateOutline(title: string, _userId: string): Promise<AIResponse<OutlineResponse>> {
    logger.info(`Generating outline for title: ${title}`);

    const prompt = generateOutlinePrompt(title);

    try {
      const response = await aiRouter.generateJSON<{
        inference: {
          targetKeyword: string;
          targetAudience: string;
          contentPurpose: string;
          estimatedWordCount: string;
        };
        outline: Array<{
          heading: string;
          subheadings?: string[];
          notes?: string;
        }>;
      }>(prompt, 'outline');

      const outlineResponse: OutlineResponse = {
        outline: {
          inference: response.data.inference,
          outline: response.data.outline,
        },
        provider: response.provider,
        tokensUsed: response.tokensUsed,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        processingTime: response.processingTime,
      };

      return {
        data: outlineResponse,
        provider: response.provider,
        tokensUsed: response.tokensUsed,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cached: response.cached,
        processingTime: response.processingTime,
      };
    } catch (error: any) {
      logger.error(`Failed to generate outline: ${error.message}`);
      throw new Error(`Failed to generate outline: ${error.message}`);
    }
  }

  /**
   * Generate full article from outline
   */
  async generateArticle(title: string, outline: ArticleOutline, _userId: string): Promise<AIResponse<ArticleResponse>> {
    logger.info(`Generating article for title: ${title}`);

    // Validate outline structure before using it
    const validation = validateOutline(outline);
    if (!validation.valid) {
      logger.error(`Invalid outline structure: ${validation.error}`);
      throw new Error(`Invalid outline structure: ${validation.error}`);
    }

    const prompt = generateArticlePrompt(title, outline);

    try {
      const response = await aiRouter.generateJSON<{
        content: string;
        metaDescription: string;
        wordCount: number;
        suggestedTags: string[];
      }>(prompt, 'article');

      const articleResponse: ArticleResponse = {
        article: {
          content: response.data.content,
          metaDescription: response.data.metaDescription,
          wordCount: response.data.wordCount,
          suggestedTags: response.data.suggestedTags,
        },
        provider: response.provider,
        tokensUsed: response.tokensUsed,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        processingTime: response.processingTime,
      };

      return {
        data: articleResponse,
        provider: response.provider,
        tokensUsed: response.tokensUsed,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cached: response.cached,
        processingTime: response.processingTime,
      };
    } catch (error: any) {
      logger.error(`Failed to generate article: ${error.message}`);
      throw new Error(`Failed to generate article: ${error.message}`);
    }
  }
}

export default new ContentService();
