import axios, { AxiosResponse } from 'axios';
import logger from './logger';
import { withRetry } from './retry';
import telegramService from '../services/telegram/telegramService';


interface WebhookPayload {
  type: 'outline' | 'article';
  data: any;
  userId: string;
  chatId: number;
}

/**
 * Validate webhook payload before sending
 */
function validateWebhookPayload(payload: WebhookPayload): void {
  if (!payload) {
    throw new Error('Webhook payload is null or undefined');
  }

  if (!payload.type || (payload.type !== 'outline' && payload.type !== 'article')) {
    throw new Error('Invalid payload type. Must be "outline" or "article"');
  }

  if (!payload.data) {
    throw new Error('Payload data is null or undefined');
  }

  if (!payload.userId || typeof payload.userId !== 'string') {
    throw new Error('Invalid userId in payload');
  }

  if (!payload.chatId || typeof payload.chatId !== 'number') {
    throw new Error('Invalid chatId in payload');
  }

  // Type-specific validation
  if (payload.type === 'outline') {
    if (!payload.data.outline || typeof payload.data.outline !== 'object') {
      throw new Error('Invalid outline data structure');
    }
  } else if (payload.type === 'article') {
    if (!payload.data.article || typeof payload.data.article !== 'object') {
      throw new Error('Invalid article data structure');
    }
  }
}

/**
 * Gửi webhook với cơ chế retry và thông báo Telegram khi thất bại.
 * @param url URL của webhook
 * @param payload Dữ liệu gửi đi
 * @param taskName Tên tác vụ (dàn ý/bài viết)
 * @param chatId ID chat Telegram để thông báo
 */
export async function sendWebhookWithRetry(
  url: string,
  payload: WebhookPayload,
  taskName: string,
  chatId: number
): Promise<void> {
  const maxRetries = 3;
  const delayMs = 3000; // 3 giây

  logger.info(`Starting webhook send for ${taskName} to ${url}`);
  logger.debug(`Webhook payload type: ${payload.type}, userId: ${payload.userId}, chatId: ${payload.chatId}`);

  // Validate payload before sending
  try {
    validateWebhookPayload(payload);
    logger.info('Webhook payload validation passed');
  } catch (validationError: any) {
    logger.error(`Webhook payload validation failed: ${validationError.message}`);
    logger.error(`Validation error stack: ${validationError.stack}`);

    // Notify user about validation error
    try {
      await telegramService.sendMessage(
        chatId,
        `❌ *Lỗi nội bộ*\n\nDữ liệu ${taskName} không hợp lệ. Vui lòng liên hệ admin.\n\nChi tiết: ${validationError.message}`,
        { parse_mode: 'Markdown' }
      );
    } catch (notifyError: any) {
      logger.error(`Failed to notify user about validation error: ${notifyError.message}`);
    }

    throw new Error(`Invalid webhook payload: ${validationError.message}`);
  }

  try {
    await withRetry(
      async () => {
        logger.info(`Attempting webhook send for ${taskName}...`);

        try {
          const response: AxiosResponse = await axios.post(url, payload.data, {
            timeout: 10000, // 10 giây timeout
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Telegram-SEO-Bot/1.0'
            }
          });

          if (response.status !== 200) {
            // Nếu không phải 200, coi là thất bại và retry
            logger.warn(
              `Webhook for ${taskName} failed with status ${response.status}. Will retry.`
            );
            logger.debug(`Response data: ${JSON.stringify(response.data).substring(0, 200)}`);
            throw new Error(`Webhook failed with status code ${response.status}`);
          }

          logger.info(`✅ Webhook for ${taskName} sent successfully (Status 200)`);
          logger.debug(`Response: ${JSON.stringify(response.data).substring(0, 100)}`);
          return response;
        } catch (axiosError: any) {
          // Enhanced error logging for different error types
          if (axiosError.code === 'ECONNREFUSED') {
            logger.error(`Connection refused to webhook URL: ${url}`);
            throw new Error('Webhook server connection refused');
          } else if (axiosError.code === 'ETIMEDOUT' || axiosError.code === 'ECONNABORTED') {
            logger.error(`Webhook request timeout for ${taskName}`);
            throw new Error('Webhook request timeout');
          } else if (axiosError.response) {
            logger.error(`Webhook server returned error: ${axiosError.response.status}`);
            logger.error(`Error response: ${JSON.stringify(axiosError.response.data).substring(0, 200)}`);
            throw axiosError;
          } else {
            logger.error(`Webhook request error: ${axiosError.message}`);
            throw axiosError;
          }
        }
      },
      {
        maxRetries: maxRetries,
        baseDelay: delayMs,
        maxDelay: delayMs, // Không dùng exponential backoff, giữ nguyên 3s
        taskName: `Gửi webhook ${taskName}`,
      }
    );

    logger.info(`✅ Webhook send completed successfully for ${taskName}`);
  } catch (error: any) {
    logger.error(`=`.repeat(50));
    logger.error(`WEBHOOK SEND FAILED for ${taskName} after ${maxRetries} retries`);
    logger.error(`URL: ${url}`);
    logger.error(`Error: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    logger.error(`=`.repeat(50));

    // Gửi thông báo thất bại về Telegram cho người dùng đang tương tác
    try {
      await telegramService.sendMessage(
        chatId,
        `❌ *Lỗi gửi kết quả*\n\n` +
        `Hệ thống đã tạo xong ${taskName} nhưng không thể gửi kết quả đến máy chủ của bạn tại \`${url}\` sau ${maxRetries} lần thử.\n\n` +
        `Lỗi: ${error.message}\n\n` +
        `Vui lòng kiểm tra lại URL webhook và đảm bảo máy chủ của bạn trả về HTTP 200 OK.`,
        { parse_mode: 'Markdown' }
      );
    } catch (notifyError: any) {
      logger.error(`Failed to notify user about webhook error: ${notifyError.message}`);
      logger.error(`Notify error stack: ${notifyError.stack}`);
    }

    // Don't throw - we've already logged and notified user
    // This prevents the error from bubbling up and potentially crashing the bot
  }
}
