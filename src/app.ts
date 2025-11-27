import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import path from 'path';
import TelegramBot from 'node-telegram-bot-api';
import { config } from './config';
import logger from './utils/logger';
import telegramService from './services/telegram/telegramService';
import botManager from './services/telegram/botManager';
import telegramController from './controllers/telegramController';
import configController from './controllers/configController';
import rateLimiter from './utils/rateLimiter';

const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for local development
}));
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

/**
 * Handle bot commands and messages (shared between webhook and polling modes)
 */
async function handleBotMessage(msg: TelegramBot.Message): Promise<void> {
  try {
    const userId = msg.from?.id || 'unknown';
    const chatId = msg.chat.id;

    // Handle commands
    if (msg.text?.startsWith('/')) {
      const command = msg.text.split(' ')[0].toLowerCase();
      logger.info(`Processing command: ${command} from user ${userId} in chat ${chatId}`);

      switch (command) {
        case '/start':
          await telegramController.handleStart(msg);
          break;
        case '/help':
          await telegramController.handleHelp(msg);
          break;
        case '/generate':
          await telegramController.handleGenerate(msg);
          break;
        case '/cancel':
          await telegramController.handleCancel(msg);
          break;
        case '/stats':
          await telegramController.handleStats(msg);
          break;
        default:
          logger.warn(`Unknown command: ${command} from user ${userId}`);
          await telegramService.sendMessage(
            msg.chat.id,
            '❓ Lệnh không hợp lệ. Dùng /help để xem danh sách lệnh.'
          );
      }
    } else {
      // Handle regular messages
      logger.debug(`Processing message from user ${userId} in chat ${chatId}`);
      await telegramController.handleMessage(msg);
    }
  } catch (error: any) {
    const userId = msg.from?.id || 'unknown';
    const chatId = msg.chat.id;
    logger.error(`Critical error in handleBotMessage for user ${userId}: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);

    // Try to notify user, but don't throw if this fails
    try {
      await telegramService.sendMessage(
        chatId,
        '❌ Đã xảy ra lỗi không mong muốn. Vui lòng thử lại sau hoặc liên hệ admin.'
      );
    } catch (notifyError: any) {
      logger.error(`Failed to notify user about error: ${notifyError.message}`);
    }
  }
}

/**
 * Setup message handlers for polling mode
 * This will be called on initial start and on bot restart
 */
function setupPollingHandlers(bot: TelegramBot): void {
  logger.info('Setting up polling message handlers');

  bot.on('message', async (msg: TelegramBot.Message) => {
    try {
      // Validate message has a valid sender
      if (!msg.from || !msg.from.id) {
        logger.warn('Received message without valid sender information');
        return;
      }
      await handleBotMessage(msg);
    } catch (error: any) {
      logger.error(`Unexpected error in message handler: ${error.message}`);
      logger.error(`Error stack: ${error.stack}`);
      // Don't re-throw - keep bot running
    }
  });

  // Handle polling errors to prevent bot crash
  bot.on('polling_error', (error: any) => {
    // Handle network errors gracefully (ECONNRESET, ETIMEDOUT, etc.)
    if (error.code === 'EFATAL' || error.message?.includes('ECONNRESET') || error.message?.includes('ETIMEDOUT')) {
      logger.warn(`Telegram polling connection issue: ${error.code || 'NETWORK_ERROR'} - will auto-retry`);
    } else {
      // Log other errors with full details
      logger.error(`Polling error: ${error.message}`);
      logger.error(`Error details: ${JSON.stringify(error)}`);
    }
    // Don't crash - bot will continue polling
  });

  // Handle webhook errors (though we're in polling mode, this is defensive)
  bot.on('webhook_error', (error: Error) => {
    logger.error(`Webhook error in polling mode: ${error.message}`);
  });

  logger.info('Polling handlers setup completed');
}

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Config management API endpoints
app.get('/api/config', configController.getConfig.bind(configController));
app.post('/api/config', configController.updateConfig.bind(configController));
app.get('/api/config/defaults', configController.getDefaults.bind(configController));

// Webhook endpoint for Telegram
app.post(`/webhook/${config.telegram.botToken}`, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate secret token if configured (recommended for production)
    if (config.telegram.secretToken && config.telegram.secretToken.length > 0) {
      const receivedToken = req.headers['x-telegram-bot-api-secret-token'];
      if (receivedToken !== config.telegram.secretToken) {
        logger.warn(`Webhook request with invalid secret token from IP: ${req.ip}`);
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    // Always respond 200 to Telegram to prevent retries
    res.sendStatus(200);

    const update: TelegramBot.Update = req.body;

    logger.debug(`Received webhook update: ${JSON.stringify(update).substring(0, 200)}`);

    // Handle callback queries (inline buttons)
    if (update.callback_query) {
      logger.info('Callback query received');
      return;
    }

    // Handle messages
    if (update.message) {
      // Validate message has a valid sender
      if (!update.message.from || !update.message.from.id) {
        logger.warn('Received message without valid sender information');
        return;
      }

      // Check rate limit for this user
      const userId = update.message.from.id.toString();
      const rateLimit = rateLimiter.checkLimit(userId);
      if (!rateLimit.allowed) {
        logger.info(`Rate limit exceeded for user ${userId}`);
        await telegramService.sendMessage(
          update.message.chat.id,
          `⏳ *Giới hạn tốc độ*\n\nBạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ${rateLimit.retryAfter} giây.`
        );
        return;
      }

      await handleBotMessage(update.message);
    }
  } catch (error: any) {
    logger.error(`Critical webhook error: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    // Error logged, but 200 already sent to prevent Telegram retries
    // System continues running despite error
  }
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

/**
 * Initialize and start the application
 */
async function start() {
  try {
    logger.info('='.repeat(50));
    logger.info('Starting Telegram SEO Content Bot...');
    logger.info('='.repeat(50));

    // Register handler setup for polling mode
    // This will be called both on initial start and on bot restart
    if (config.telegram.botMode === 'polling') {
      logger.info('Registering polling mode handler setup');
      botManager.setHandlerSetup(setupPollingHandlers);
    }

    // Initialize bot using botManager (handles token check internally)
    logger.info('Initializing bot manager...');
    const bot = await botManager.startBot();

    if (bot && config.telegram.botMode === 'polling') {
      // Polling mode - no webhook needed
      logger.info('='.repeat(50));
      logger.info('🚀 POLLING MODE STARTUP');
      logger.info('='.repeat(50));
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`Primary AI provider: ${config.ai.defaultProvider}`);

      if (config.ai.backupAI) {
        const backupProvider = config.ai.defaultProvider === 'claude' ? 'openrouter' : 'claude';
        logger.info(`Backup AI: enabled (${backupProvider})`);
      } else {
        logger.info(`Backup AI: disabled`);
      }

      logger.info(`Rate limiting: ${config.rateLimit.enabled ? 'enabled' : 'disabled'}`);
      if (config.rateLimit.enabled) {
        logger.info(`  - Max requests/min: ${config.rateLimit.maxRequestsPerMinute}`);
        logger.info(`  - AI timeout: ${config.rateLimit.aiRequestTimeout / 1000}s`);
      }
      logger.info('='.repeat(50));
      logger.info('✨ Bot is ready and listening for messages!');
      logger.info('='.repeat(50));
    } else if (bot) {
      // Webhook mode
      logger.info('='.repeat(50));
      logger.info('🚀 WEBHOOK MODE STARTUP');
      logger.info('='.repeat(50));

      // Set webhook
      const webhookUrl = `${config.webhookUrl}/webhook/${config.telegram.botToken}`;
      const webhookOptions: any = { url: webhookUrl };

      // Add secret token if configured for additional security
      if (config.telegram.secretToken && config.telegram.secretToken.length > 0) {
        webhookOptions.secret_token = config.telegram.secretToken;
        logger.info('Webhook security: secret token enabled');
      }

      logger.info(`Setting webhook to: ${webhookUrl}`);
      await bot.setWebHook(webhookUrl, webhookOptions);
      logger.info('✅ Webhook configured successfully');

      // Start Express server
      app.listen(config.port, () => {
        logger.info(`Server listening on port ${config.port}`);
        logger.info(`Environment: ${config.nodeEnv}`);
        logger.info(`Primary AI provider: ${config.ai.defaultProvider}`);

        if (config.ai.backupAI) {
          const backupProvider = config.ai.defaultProvider === 'claude' ? 'openrouter' : 'claude';
          logger.info(`Backup AI: enabled (${backupProvider})`);
        } else {
          logger.info(`Backup AI: disabled`);
        }

        logger.info(`Rate limiting: ${config.rateLimit.enabled ? 'enabled' : 'disabled'}`);
        logger.info('='.repeat(50));
        logger.info('✨ Bot is ready and listening for webhooks!');
        logger.info('='.repeat(50));
      });
    } else {
      // No telegram token - start only web server for configuration
      logger.info('='.repeat(50));
      logger.info('🌐 CONFIG-ONLY MODE STARTUP');
      logger.info('='.repeat(50));
      app.listen(config.port, () => {
        logger.info(`Web Configuration UI running on port ${config.port}`);
        logger.info(`Access at: http://localhost:${config.port}`);
        logger.warn('⚠️  Telegram features disabled - configure token via Web UI');
        logger.info('🔄 Restart bot after configuration to enable Telegram');
        logger.info('='.repeat(50));
      });
    }

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info('='.repeat(50));
      logger.info(`${signal} received, initiating graceful shutdown...`);
      logger.info('='.repeat(50));

      try {
        // Stop bot using botManager
        logger.info('Stopping bot...');
        await botManager.stopBot();
        logger.info('✅ Bot stopped successfully');

        // Cleanup rate limiter
        logger.info('Cleaning up rate limiter...');
        const rateLimiter = (await import('./utils/rateLimiter')).default;
        rateLimiter.destroy();
        logger.info('✅ Rate limiter cleaned up');

        // Cleanup conversation manager
        logger.info('Cleaning up conversation manager...');
        const conversationManager = (await import('./services/content/conversationManager')).default;
        conversationManager.destroy();
        logger.info('✅ Conversation manager cleaned up');

        logger.info('='.repeat(50));
        logger.info('Shutdown completed successfully');
        logger.info('='.repeat(50));
      } catch (error: any) {
        logger.error(`Error during shutdown: ${error.message}`);
        logger.error(`Error stack: ${error.stack}`);
        // Continue shutdown despite errors
      }

      process.exit(0);
    };

    // Handle uncaught exceptions to prevent silent crashes
    process.on('uncaughtException', (error: Error) => {
      logger.error('='.repeat(50));
      logger.error('UNCAUGHT EXCEPTION - This should not happen!');
      logger.error('='.repeat(50));
      logger.error(`Error: ${error.message}`);
      logger.error(`Stack: ${error.stack}`);
      logger.error('='.repeat(50));
      // Don't exit - try to keep running
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      logger.error('='.repeat(50));
      logger.error('UNHANDLED PROMISE REJECTION');
      logger.error('='.repeat(50));
      logger.error(`Reason: ${reason}`);
      logger.error(`Promise: ${promise}`);
      if (reason?.stack) {
        logger.error(`Stack: ${reason.stack}`);
      }
      logger.error('='.repeat(50));
      // Don't exit - try to keep running
    });

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error: any) {
    logger.error('='.repeat(50));
    logger.error('FATAL ERROR - Application failed to start');
    logger.error('='.repeat(50));
    logger.error(`Error: ${error.message}`);
    logger.error(`Stack: ${error.stack}`);
    logger.error('='.repeat(50));
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  start();
}

export default app;
