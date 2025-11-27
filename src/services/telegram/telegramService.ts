import TelegramBot from 'node-telegram-bot-api';
import { config } from '../../config';
import logger from '../../utils/logger';

class TelegramService {
  private bot: TelegramBot | null = null;

  /**
   * Initialize Telegram bot
   */
  init(): TelegramBot {
    if (this.bot) {
      return this.bot;
    }

    const usePolling = config.telegram.botMode === 'polling';

    this.bot = new TelegramBot(config.telegram.botToken, {
      polling: usePolling,
    });

    logger.info(`Telegram bot service initialized (${config.telegram.botMode} mode)`);
    return this.bot;
  }

  /**
   * Get bot instance
   */
  getBot(): TelegramBot {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized');
    }
    return this.bot;
  }

  /**
   * Clear bot instance (used when stopping/restarting)
   */
  clearBot(): void {
    this.bot = null;
  }

  /**
   * Send message with formatting
   * Returns true if message was sent successfully, false otherwise
   */
  async sendMessage(chatId: number, text: string, options?: TelegramBot.SendMessageOptions): Promise<boolean> {
    try {
      await this.getBot().sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        ...options,
      });
      return true;
    } catch (error: any) {
      logger.error(`Failed to send message to ${chatId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Send typing action
   */
  async sendTypingAction(chatId: number): Promise<void> {
    try {
      await this.getBot().sendChatAction(chatId, 'typing');
    } catch (error: any) {
      logger.error(`Failed to send typing action: ${error.message}`);
    }
  }

  /**
   * Format titles for display
   */
  formatTitles(titles: Array<{ titleNumber: string; title: string }>): string {
    let message = '✨ *10 Tiêu đề bài viết SEO cho bạn:*\n\n';

    titles.forEach((item, index) => {
      message += `${index + 1}. ${item.title}\n\n`;
    });

    message += '📝 Vui lòng gửi số thứ tự (1-10) của tiêu đề bạn muốn tạo dàn ý.';
    return message;
  }

  /**
   * Format outline for display
   */
  formatOutline(outline: {
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
  }): string {
    let message = '📋 *Dàn ý bài viết chi tiết:*\n\n';

    // Inference section
    message += '*🎯 Phân tích tự động:*\n';
    message += `• Từ khóa chính: \`${outline.inference.targetKeyword}\`\n`;
    message += `• Đối tượng đọc giả: ${outline.inference.targetAudience}\n`;
    message += `• Mục tiêu bài viết: ${outline.inference.contentPurpose}\n`;
    message += `• Độ dài dự kiến: ${outline.inference.estimatedWordCount}\n\n`;

    // Outline sections
    message += '*📝 Cấu trúc bài viết:*\n\n';

    outline.outline.forEach((section) => {
      message += `*${section.heading}*\n`;

      if (section.subheadings && section.subheadings.length > 0) {
        section.subheadings.forEach((sub) => {
          message += `  • ${sub}\n`;
        });
      }

      if (section.notes) {
        message += `  _${section.notes}_\n`;
      }

      message += '\n';
    });

    return message;
  }

  /**
   * Format error message
   */
  formatError(error: string): string {
    return `❌ *Lỗi:* ${error}\n\nVui lòng thử lại hoặc liên hệ admin nếu lỗi tiếp diễn.`;
  }

  /**
   * Format rate limit message
   */
  formatRateLimit(retryAfter: number): string {
    return `⏳ *Giới hạn tốc độ*\n\nBạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ${retryAfter} giây.`;
  }

  /**
   * Get main menu keyboard
   */
  getMainMenuKeyboard(): TelegramBot.ReplyKeyboardMarkup {
    return {
      keyboard: [
        [
          { text: '✨ Tạo nội dung' },
          { text: '📊 Thống kê' },
        ],
        [
          { text: '❌ Hủy' },
          { text: '❓ Trợ giúp' },
        ],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    };
  }
}

export default new TelegramService();
