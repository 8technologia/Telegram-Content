import TelegramBot from 'node-telegram-bot-api';

import telegramService from '../services/telegram/telegramService';
import contentService from '../services/content/contentService';
import conversationManager from '../services/content/conversationManager';
import rateLimiter from '../utils/rateLimiter';
import logger from '../utils/logger';
import { validateTopic, validateTitleSelection, sanitizeForLog, sanitizeInput } from '../utils/validation';
import { calculateCost, formatCost, formatDuration } from '../utils/pricing';
import { convertMarkdownForWordPress } from '../utils/markdownConverter';

import { sendWebhookWithRetry } from '../utils/webhook';
import { config } from '../config';

class TelegramController {
  /**
   * Get provider display name (primary or backup indicator)
   */
  private getProviderDisplay(provider: string): string {
    const isPrimary = provider === config.ai.defaultProvider;

    if (provider === 'claude') {
      return isPrimary ? '🤖 Claude AI' : '🤖 Claude AI (Backup)';
    } else if (provider === 'openrouter') {
      return isPrimary ? '🔄 OpenRouter' : '🔄 OpenRouter (Backup)';
    }

    return provider;
  }

  /**
   * Handle /start command
   */
  async handleStart(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    // msg.from is guaranteed to exist due to validation in app.ts
    const userId = msg.from!.id.toString();

    logger.info(`/start command from user ${userId}`);

    const welcomeMessage = `
🤖 *Chào mừng đến với Bot Tạo Nội dung!*

Bot này giúp bạn:
✅ Tạo 10 tiêu đề bài viết chuyên nghiệp
✅ Tạo dàn ý chi tiết với cấu trúc logic
✅ Viết bài hoàn chỉnh từ dàn ý và đẩy tới webhook

*🚀 Hướng dẫn sử dụng:*

1. Dùng lệnh /generate để bắt đầu
2. Nhập chủ đề bài viết của bạn
3. Chọn tiêu đề yêu thích từ 10 gợi ý
4. Nhận dàn ý chi tiết ngay lập tức!
5. Sau đó tôi sẽ viết thành bài hoàn chỉnh

*📝 Các lệnh có sẵn:*
/generate - Bắt đầu tạo nội dung
/cancel - Hủy quá trình hiện tại
/stats - Xem thống kê hệ thống
/help - Xem hướng dẫn

Hãy thử /generate để bắt đầu! 🎯
    `.trim();

    await telegramService.sendMessage(chatId, welcomeMessage, {
      reply_markup: telegramService.getMainMenuKeyboard(),
    });
  }

  /**
   * Handle /help command
   */
  async handleHelp(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    const helpMessage = `
📚 *Hướng dẫn chi tiết*

*1. Tạo nội dung:*
Dùng /generate và làm theo hướng dẫn

*2. Nhập chủ đề:*
Nhập chủ đề rõ ràng, cụ thể
Ví dụ: "Cách tăng tốc độ website WordPress"

*3. Chọn tiêu đề:*
Bot sẽ tạo 10 tiêu đề SEO, gửi số từ 1-10 để chọn

*4. Nhận dàn ý:*
Bot tự động tạo dàn ý chi tiết với phân tích từ khóa

*💡 Tips:*
• Chủ đề càng cụ thể, kết quả càng tốt
• Sử dụng /cancel nếu muốn bắt đầu lại
• Xem /stats để theo dõi hiệu suất hệ thống

Có câu hỏi? Liên hệ admin! 📞
    `.trim();

    await telegramService.sendMessage(chatId, helpMessage);
  }

  /**
   * Handle /generate command
   */
  async handleGenerate(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    // msg.from is guaranteed to exist due to validation in app.ts
    const userId = msg.from!.id.toString();

    logger.info(`/generate command from user ${userId}`);

    // Check rate limit
    const rateLimit = rateLimiter.checkLimit(userId);
    if (!rateLimit.allowed) {
      await telegramService.sendMessage(chatId, telegramService.formatRateLimit(rateLimit.retryAfter!));
      return;
    }

    // Reset conversation and start new flow
    conversationManager.resetConversation(userId, chatId);
    conversationManager.updateConversation(userId, chatId, {
      step: 'waiting_topic',
    });

    const message = `
🎯 *Bắt đầu tạo nội dung!*

Vui lòng nhập *chủ đề* bài viết của bạn.

Ví dụ:
• "Cách tối ưu SEO cho website bất động sản"
• "10 chiến lược marketing hiệu quả cho startup"
• "Hướng dẫn sử dụng n8n"

_Nhập chủ đề của bạn bên dưới:_
    `.trim();

    await telegramService.sendMessage(chatId, message);
  }

  /**
   * Handle /cancel command
   */
  async handleCancel(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    // msg.from is guaranteed to exist due to validation in app.ts
    const userId = msg.from!.id.toString();

    logger.info(`/cancel command from user ${userId}`);

    // Reset conversation state
    conversationManager.resetConversation(userId, chatId);

    await telegramService.sendMessage(chatId, '❌ Đã hủy quá trình hiện tại. Dùng /generate để bắt đầu lại.');
  }

  /**
   * Handle /stats command
   */
  async handleStats(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    // msg.from is guaranteed to exist due to validation in app.ts
    const userId = msg.from!.id.toString();

    logger.info(`/stats command from user ${userId}`);

    const rateLimitStats = rateLimiter.getStats();
    const conversationStats = conversationManager.getStats();

    const statsMessage = `
📊 *Thống kê hệ thống*

*Rate Limiting:*
• Status: ${rateLimitStats.enabled ? '✅ Enabled' : '❌ Disabled'}
• Max requests/min: ${rateLimitStats.maxRequestsPerMinute}
• Tracked users: ${rateLimitStats.trackedUsers}

*Conversations:*
• Active: ${conversationStats.activeConversations}

_Hệ thống hoạt động ổn định_ ✨
    `.trim();

    await telegramService.sendMessage(chatId, statsMessage);
  }

  /**
   * Handle regular text messages
   */
  async handleMessage(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    // msg.from is guaranteed to exist due to validation in app.ts
    const userId = msg.from!.id.toString();
    const text = msg.text?.trim();

    if (!text) return;

    logger.info(`Message from user ${userId}: ${sanitizeForLog(text)}`);

    // Map keyboard button text to commands
    if (text === '✨ Tạo nội dung') {
      return this.handleGenerate(msg);
    } else if (text === '📊 Thống kê') {
      return this.handleStats(msg);
    } else if (text === '❌ Hủy') {
      return this.handleCancel(msg);
    } else if (text === '❓ Trợ giúp') {
      return this.handleHelp(msg);
    }

    // Check rate limit
    const rateLimit = rateLimiter.checkLimit(userId);
    if (!rateLimit.allowed) {
      await telegramService.sendMessage(chatId, telegramService.formatRateLimit(rateLimit.retryAfter!));
      return;
    }

    const conversation = conversationManager.getConversation(userId, chatId);

    try {
      switch (conversation.step) {
        case 'idle':
          await this.handleIdleState(chatId, userId);
          break;

        case 'waiting_topic':
          await this.handleTopicInput(chatId, userId, text);
          break;

        case 'waiting_title_selection':
          await this.handleTitleSelection(chatId, userId, text);
          break;

        default:
          await telegramService.sendMessage(chatId, 'Trạng thái không hợp lệ. Dùng /generate để bắt đầu lại.');
      }
    } catch (error: any) {
      logger.error(`Error handling message: ${error.message}`);
      await telegramService.sendMessage(chatId, telegramService.formatError(error.message));
      conversationManager.resetConversation(userId, chatId);
    }
  }

  /**
   * Handle idle state
   */
  private async handleIdleState(chatId: number, _userId: string): Promise<void> {
    await telegramService.sendMessage(chatId, 'Dùng /generate để bắt đầu tạo nội dung, hoặc /help để xem hướng dẫn.');
  }

  /**
   * Handle topic input and generate titles immediately
   */
  private async handleTopicInput(chatId: number, userId: string, topic: string): Promise<void> {
    logger.info(`[User ${userId}] Topic input received: "${sanitizeForLog(topic)}"`);

    // Sanitize and validate input first
    const sanitizedTopic = sanitizeInput(topic);
    const validation = validateTopic(sanitizedTopic);

    if (!validation.valid) {
      logger.warn(`[User ${userId}] Topic validation failed: ${validation.error}`);
      await telegramService.sendMessage(chatId, `❌ ${validation.error}`);
      return;
    }

    logger.info(`[User ${userId}] Topic validated: "${sanitizedTopic}"`);

    // Try to acquire processing lock atomically
    logger.debug(`[User ${userId}] Attempting to acquire lock for titles generation`);
    const lockAcquired = await conversationManager.tryAcquireLock(userId, chatId, 'titles');
    if (!lockAcquired) {
      const conversation = conversationManager.getConversation(userId, chatId);
      logger.warn(`[User ${userId}] Lock acquisition failed - already processing: ${conversation.processingTask}`);
      await telegramService.sendMessage(
        chatId,
        `⏳ *Bot đang xử lý yêu cầu trước*\n\nTask: ${conversation.processingTask}\n\nVui lòng chờ hoặc dùng /cancel để hủy.`
      );
      return;
    }

    logger.info(`[User ${userId}] Lock acquired - starting titles generation`);

    // Update conversation state after acquiring lock
    conversationManager.updateConversation(userId, chatId, {
      topic: sanitizedTopic,
      step: 'waiting_title_selection',
    });

    try {
      await telegramService.sendTypingAction(chatId);
      await telegramService.sendMessage(
        chatId,
        `✅ Chủ đề: *${sanitizedTopic}*\n\n🔄 Đang tạo 10 tiêu đề bài viết cho bạn...\n\n_Vui lòng chờ 10-20 giây..._`
      );

      logger.info(`[User ${userId}] Generating titles...`);
      const result = await contentService.generateTitles(sanitizedTopic, userId);
      logger.info(`[User ${userId}] Titles generated successfully using ${result.provider}`);

      conversationManager.updateConversation(userId, chatId, {
        generatedTitles: result.data.titles,
      });

      const titlesMessage = telegramService.formatTitles(result.data.titles);

      // Calculate cost
      const cost = result.inputTokens && result.outputTokens
        ? calculateCost(result.provider as 'claude' | 'openrouter', result.inputTokens, result.outputTokens)
        : 0;

      const providerDisplay = this.getProviderDisplay(result.provider);
      const footer = `\n\n📊 *Thống kê:*\n• Provider: ${providerDisplay}\n• Tokens: ${result.tokensUsed || 0}\n• Chi phí: ${formatCost(cost)}`;

      logger.info(`[User ${userId}] Sending titles to user`);
      await telegramService.sendMessage(chatId, titlesMessage + footer);
      logger.info(`[User ${userId}] Titles sent successfully - waiting for selection`);
    } catch (error: any) {
      logger.error(`[User ${userId}] Error during titles generation: ${error.message}`);
      logger.error(`Error stack: ${error.stack}`);

      // Handle timeout specifically
      if (error.message?.includes('timeout')) {
        const timeoutMinutes = Math.round(config.rateLimit.aiRequestTimeout / 60000);
        logger.warn(`[User ${userId}] Titles generation timed out after ${timeoutMinutes} minutes`);
        await telegramService.sendMessage(
          chatId,
          `⏰ *Timeout*\n\nYêu cầu vượt quá thời gian cho phép (${timeoutMinutes} phút).\n\nVui lòng thử lại hoặc chọn chủ đề ngắn gọn hơn.`
        );
        conversationManager.resetConversation(userId, chatId);
        return;
      }
      throw error; // Re-throw other errors to outer handler
    } finally {
      // Always release processing lock
      logger.debug(`[User ${userId}] Releasing titles generation lock`);
      conversationManager.releaseLock(userId, chatId);
    }
  }

  /**
   * Handle title selection and generate outline
   */
  private async handleTitleSelection(chatId: number, userId: string, selection: string): Promise<void> {
    logger.info(`[User ${userId}] Title selection received: "${selection}"`);

    // Get conversation and validate titles exist
    const conversation = conversationManager.getConversation(userId, chatId);
    if (!conversation.generatedTitles) {
      logger.error(`[User ${userId}] No titles found in conversation state`);
      throw new Error('No titles found. Please start over with /generate');
    }

    // Validate selection
    const validation = validateTitleSelection(selection);
    if (!validation.valid) {
      logger.warn(`[User ${userId}] Title selection validation failed: ${validation.error}`);
      await telegramService.sendMessage(chatId, `❌ ${validation.error}`);
      return;
    }

    // Defensive programming: double-check selectedIndex
    const selectedIndex = parseInt(selection, 10);
    if (isNaN(selectedIndex) || selectedIndex < 1 || selectedIndex > 10) {
      logger.warn(`[User ${userId}] Invalid title index: ${selectedIndex}`);
      await telegramService.sendMessage(chatId, '❌ Số thứ tự không hợp lệ. Vui lòng chọn từ 1-10.');
      return;
    }

    // Defensive programming: check if index is within array bounds
    if (!conversation.generatedTitles || conversation.generatedTitles.length < selectedIndex) {
      logger.error(`[User ${userId}] Title index out of bounds: ${selectedIndex} (available: ${conversation.generatedTitles?.length || 0})`);
      await telegramService.sendMessage(chatId, '❌ Tiêu đề không tồn tại. Vui lòng dùng /generate để bắt đầu lại.');
      conversationManager.resetConversation(userId, chatId);
      return;
    }

    const selectedTitle = conversation.generatedTitles[selectedIndex - 1]?.title;
    if (!selectedTitle) {
      logger.error(`[User ${userId}] Failed to retrieve title at index ${selectedIndex}`);
      await telegramService.sendMessage(chatId, '❌ Không thể lấy tiêu đề. Vui lòng dùng /generate để bắt đầu lại.');
      conversationManager.resetConversation(userId, chatId);
      return;
    }

    logger.info(`[User ${userId}] Title selected: "${sanitizeForLog(selectedTitle)}"`);

    // Try to acquire processing lock atomically
    logger.debug(`[User ${userId}] Attempting to acquire lock for outline generation`);
    const lockAcquired = await conversationManager.tryAcquireLock(userId, chatId, 'outline');
    if (!lockAcquired) {
      logger.warn(`[User ${userId}] Lock acquisition failed - already processing: ${conversation.processingTask}`);
      await telegramService.sendMessage(
        chatId,
        `⏳ *Bot đang xử lý yêu cầu trước*\n\nTask: ${conversation.processingTask}\n\nVui lòng chờ hoặc dùng /cancel để hủy.`
      );
      return;
    }

    logger.info(`[User ${userId}] Lock acquired - starting outline generation`);

    // Update conversation state after acquiring lock
    conversationManager.updateConversation(userId, chatId, {
      selectedTitle,
      step: 'outline_generated',
    });

    try {
      await telegramService.sendTypingAction(chatId);
      await telegramService.sendMessage(
        chatId,
        `✅ Bạn đã chọn tiêu đề: *${selectedTitle}*\n\n🔄 Đang tạo dàn ý chi tiết..._`
      );

      logger.info(`[User ${userId}] Generating outline...`);
      const result = await contentService.generateOutline(selectedTitle, userId);
      logger.info(`[User ${userId}] Outline generated successfully using ${result.provider}`);

      conversationManager.updateConversation(userId, chatId, {
        generatedOutline: result.data.outline,
        step: 'idle',
      });

      // Calculate cost
      const cost = result.inputTokens && result.outputTokens
        ? calculateCost(result.provider as 'claude' | 'openrouter', result.inputTokens, result.outputTokens)
        : 0;

      // Send simplified summary to Telegram
      const providerDisplay = this.getProviderDisplay(result.provider);
      const summaryMessage = `
✅ *Dàn ý đã được tạo thành công!*

📊 *Thông tin chi tiết:*
• AI Provider: ${providerDisplay}
• Thời gian xử lý: ${formatDuration(result.processingTime)}
• Tokens sử dụng: ${result.tokensUsed || 0} (input: ${result.inputTokens || 0}, output: ${result.outputTokens || 0})
• Chi phí ước tính: ${formatCost(cost)}

📝 *Trạng thái:* Đang tiến hành viết bài...

_Dàn ý chi tiết đã được gửi đến webhook để tiếp tục xử lý._
      `.trim();

      logger.info(`[User ${userId}] Sending outline summary to user`);
      await telegramService.sendMessage(chatId, summaryMessage);

      // Send full outline to webhook with retry
      const webhookPayload = {
        type: 'outline',
        userId,
        chatId,
        topic: conversation.topic,
        selectedTitle,
        outline: result.data.outline,
        metadata: {
          provider: result.provider,
          processingTime: result.processingTime,
          tokensUsed: result.tokensUsed,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          cost,
          formattedCost: formatCost(cost),
          cached: result.cached,
          timestamp: new Date().toISOString(),
        },
      };

      // Send full outline to webhook with retry
      logger.info(`[User ${userId}] Sending outline to webhook`);
      await sendWebhookWithRetry(
        config.webhookUrl,
        {
          type: 'outline',
          data: webhookPayload,
          userId,
          chatId,
        },
        'dàn ý',
        chatId
      );

      // Release outline lock before starting article generation
      logger.debug(`[User ${userId}] Releasing outline generation lock`);
      conversationManager.releaseLock(userId, chatId);

      // Automatically generate full article from outline
      logger.info(`[User ${userId}] Starting article generation`);
      await this.generateArticle(chatId, userId, selectedTitle, result.data.outline);
    } catch (error: any) {
      logger.error(`[User ${userId}] Error during outline generation: ${error.message}`);
      logger.error(`Error stack: ${error.stack}`);

      // Handle timeout specifically
      if (error.message?.includes('timeout')) {
        const timeoutMinutes = Math.round(config.rateLimit.aiRequestTimeout / 60000);
        logger.warn(`[User ${userId}] Outline generation timed out after ${timeoutMinutes} minutes`);
        await telegramService.sendMessage(
          chatId,
          `⏰ *Timeout*\n\nYêu cầu vượt quá thời gian cho phép (${timeoutMinutes} phút).\n\nVui lòng thử lại hoặc chọn tiêu đề ngắn gọn hơn.`
        );
        conversationManager.resetConversation(userId, chatId);
        return;
      }

      // Release lock on error
      logger.debug(`[User ${userId}] Releasing outline generation lock due to error`);
      conversationManager.releaseLock(userId, chatId);
      throw error; // Re-throw other errors to outer handler
    }
  }

  /**
   * Generate full article from outline
   */
  private async generateArticle(chatId: number, userId: string, title: string, outline: any): Promise<void> {
    logger.info(`[User ${userId}] Article generation requested for title: "${sanitizeForLog(title)}"`);

    // Try to acquire processing lock atomically
    logger.debug(`[User ${userId}] Attempting to acquire lock for article generation`);
    const lockAcquired = await conversationManager.tryAcquireLock(userId, chatId, 'article');
    if (!lockAcquired) {
      const conversation = conversationManager.getConversation(userId, chatId);
      logger.warn(`[User ${userId}] Lock acquisition failed - already processing: ${conversation.processingTask}`);
      await telegramService.sendMessage(
        chatId,
        `⏳ *Bot đang xử lý yêu cầu trước*\n\nTask: ${conversation.processingTask}\n\nVui lòng chờ hoặc dùng /cancel để hủy.`
      );
      return;
    }

    logger.info(`[User ${userId}] Lock acquired - starting article generation`);

    try {
      // Notify user that article generation is starting
      await telegramService.sendMessage(
        chatId,
        `📝 *Bắt đầu viết bài chi tiết...*\n\n_Quá trình này có thể mất tới 10 phút. Đợi em chút nha..._`
      );

      await telegramService.sendTypingAction(chatId);

      // Generate article
      logger.info(`[User ${userId}] Generating article...`);
      const articleResult = await contentService.generateArticle(title, outline, userId);
      logger.info(`[User ${userId}] Article generated successfully using ${articleResult.provider}`);
      logger.info(`[User ${userId}] Article stats - words: ${articleResult.data.article.wordCount}, tokens: ${articleResult.tokensUsed}`);

      // Calculate cost
      const cost = articleResult.inputTokens && articleResult.outputTokens
        ? calculateCost(articleResult.provider as 'claude' | 'openrouter', articleResult.inputTokens, articleResult.outputTokens)
        : 0;

      // Send article summary to Telegram
      const providerDisplay = this.getProviderDisplay(articleResult.provider);
      const articleSummary = `
✅ *Bài viết đã hoàn thành!*

📊 *Thông tin chi tiết:*
• AI Provider: ${providerDisplay}
• Thời gian xử lý: ${formatDuration(articleResult.processingTime)}
• Tokens sử dụng: ${articleResult.tokensUsed || 0} (input: ${articleResult.inputTokens || 0}, output: ${articleResult.outputTokens || 0})
• Chi phí ước tính: ${formatCost(cost)}

📝 *Số từ:* ~${articleResult.data.article.wordCount || 'N/A'}

_Bài viết đầy đủ đã được gửi đến webhook._
      `.trim();

      logger.info(`[User ${userId}] Sending article summary to user`);
      await telegramService.sendMessage(chatId, articleSummary);

      // Convert Markdown to WordPress-ready HTML
      logger.info(`[User ${userId}] Converting markdown to WordPress HTML`);
      let contentHtml = '';
      try {
        contentHtml = convertMarkdownForWordPress(articleResult.data.article.content);
        logger.info(`[User ${userId}] Markdown conversion successful (${contentHtml.length} chars)`);
      } catch (conversionError: any) {
        logger.error(`[User ${userId}] Markdown conversion failed: ${conversionError.message}`);
        // Continue with empty HTML - webhook can fall back to markdown
      }

      // Send full article to webhook with retry
      const articlePayload = {
        type: 'article',
        userId,
        chatId,
        title,
        article: {
          ...articleResult.data.article,
          contentHtml, // Add WordPress-ready HTML
        },
        metadata: {
          provider: articleResult.provider,
          processingTime: articleResult.processingTime,
          tokensUsed: articleResult.tokensUsed,
          inputTokens: articleResult.inputTokens,
          outputTokens: articleResult.outputTokens,
          cost,
          formattedCost: formatCost(cost),
          cached: articleResult.cached,
          timestamp: new Date().toISOString(),
        },
      };

      // Send full article to webhook with retry
      logger.info(`[User ${userId}] Sending article to webhook`);
      await sendWebhookWithRetry(
        config.webhookUrl,
        {
          type: 'article',
          data: articlePayload,
          userId,
          chatId,
        },
        'bài viết',
        chatId
      );

      logger.info(`[User ${userId}] Article generation completed successfully`);
    } catch (error: any) {
      logger.error(`[User ${userId}] Error during article generation: ${error.message}`);
      logger.error(`Error stack: ${error.stack}`);

      // Handle timeout specifically
      if (error.message?.includes('timeout')) {
        const timeoutMinutes = Math.round(config.rateLimit.aiRequestTimeout / 60000);
        logger.warn(`[User ${userId}] Article generation timed out after ${timeoutMinutes} minutes`);
        await telegramService.sendMessage(
          chatId,
          `⏰ *Timeout*\n\nYêu cầu vượt quá thời gian cho phép (${timeoutMinutes} phút).\n\nVui lòng thử lại hoặc chọn chủ đề ngắn gọn hơn.`
        );
      } else {
        logger.error(`[User ${userId}] Article generation failed with error: ${error.message}`);
        await telegramService.sendMessage(
          chatId,
          `❌ *Lỗi khi viết bài:* ${error.message}\n\nVui lòng thử lại với /generate`
        );
      }
    } finally {
      // Always release processing lock
      logger.debug(`[User ${userId}] Releasing article generation lock`);
      conversationManager.releaseLock(userId, chatId);
      logger.info(`[User ${userId}] Article generation flow completed`);
    }
  }
}

export default new TelegramController();
