import TelegramBot from 'node-telegram-bot-api';
import logger from '../../utils/logger';
import telegramService from './telegramService';
import { getConfig } from '../../config';

/**
 * Singleton Bot Manager
 * Manages Telegram bot lifecycle (start, stop, restart)
 */
class BotManager {
  private static instance: BotManager;
  private bot: TelegramBot | null = null;
  private isInitialized: boolean = false;
  private handlerSetupCallback: ((bot: TelegramBot) => void) | null = null;

  private constructor() {}

  public static getInstance(): BotManager {
    if (!BotManager.instance) {
      BotManager.instance = new BotManager();
    }
    return BotManager.instance;
  }

  /**
   * Register a callback to setup handlers when bot starts
   * This will be called both on initial start and on restart
   */
  public setHandlerSetup(callback: (bot: TelegramBot) => void): void {
    this.handlerSetupCallback = callback;
  }

  /**
   * Start Telegram bot if token is configured
   * @returns Bot instance or null if token not configured
   */
  public async startBot(): Promise<TelegramBot | null> {
    try {
      const config = getConfig();
      const hasTelegramToken = config.telegram.botToken && config.telegram.botToken.length > 0;

      if (!hasTelegramToken) {
        logger.warn('⚠️  Telegram Bot Token not configured!');
        logger.warn('📋 Bot is running in CONFIG-ONLY mode');
        logger.warn(`🌐 Please configure via Web UI: http://localhost:${config.port}`);
        logger.warn('🔄 Configure token via Web UI to enable Telegram features');
        return null;
      }

      logger.info(`Starting bot in ${config.telegram.botMode} mode...`);

      try {
        this.bot = telegramService.init();
        logger.info('✅ TelegramService initialized successfully');
      } catch (initError: any) {
        logger.error(`Failed to initialize TelegramService: ${initError.message}`);
        logger.error(`Error stack: ${initError.stack}`);
        throw initError;
      }

      try {
        const botInfo = await this.bot.getMe();
        logger.info(`✅ Bot authenticated: @${botInfo.username} (${botInfo.first_name}, ID: ${botInfo.id})`);
        this.isInitialized = true;
      } catch (authError: any) {
        logger.error(`Bot authentication failed: ${authError.message}`);
        logger.error(`Error stack: ${authError.stack}`);
        this.bot = null;
        this.isInitialized = false;
        throw new Error(`Failed to authenticate bot: ${authError.message}`);
      }

      // Setup handlers if callback is registered
      if (this.handlerSetupCallback && this.bot) {
        try {
          logger.info('Setting up message handlers...');
          this.handlerSetupCallback(this.bot);
          logger.info('✅ Message handlers attached successfully');
        } catch (handlerError: any) {
          logger.error(`Failed to setup handlers: ${handlerError.message}`);
          logger.error(`Error stack: ${handlerError.stack}`);
          // Continue despite handler setup failure - bot can still work in webhook mode
        }
      }

      logger.info(`✅ Bot startup completed successfully in ${config.telegram.botMode} mode`);
      return this.bot;
    } catch (error: any) {
      logger.error(`Critical error during bot startup: ${error.message}`);
      logger.error(`Error stack: ${error.stack}`);
      this.bot = null;
      this.isInitialized = false;
      // Don't throw - return null to allow app to continue in config-only mode
      return null;
    }
  }

  /**
   * Stop current bot instance
   */
  public async stopBot(): Promise<void> {
    if (!this.bot) {
      logger.info('No bot instance to stop');
      return;
    }

    logger.info('Stopping Telegram bot...');

    try {
      // Try to stop polling gracefully
      try {
        await this.bot.stopPolling();
        logger.info('✅ Polling stopped successfully');
      } catch (pollingError: any) {
        logger.error(`Error stopping polling: ${pollingError.message}`);
        // Continue cleanup even if stopping polling fails
      }

      // Clear bot reference
      this.bot = null;
      this.isInitialized = false;
      logger.info('Bot instance cleared');

      // Clear bot reference in telegramService
      try {
        telegramService.clearBot();
        logger.info('TelegramService bot reference cleared');
      } catch (clearError: any) {
        logger.error(`Error clearing TelegramService bot: ${clearError.message}`);
      }

      logger.info('✅ Telegram bot stopped successfully');
    } catch (error: any) {
      logger.error(`Unexpected error during bot stop: ${error.message}`);
      logger.error(`Error stack: ${error.stack}`);

      // Ensure references are cleared even if errors occurred
      this.bot = null;
      this.isInitialized = false;
      try {
        telegramService.clearBot();
      } catch {}
    }
  }

  /**
   * Restart bot (stop old, start new)
   * Used when token changes or config updates
   */
  public async restartBot(): Promise<TelegramBot | null> {
    logger.info('='.repeat(50));
    logger.info('🔄 Restarting Telegram bot...');
    logger.info('='.repeat(50));

    try {
      // Stop existing bot
      await this.stopBot();
      logger.info('Old bot instance stopped');

      // Wait a bit to ensure cleanup is complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Start new bot
      const newBot = await this.startBot();

      if (newBot) {
        logger.info('='.repeat(50));
        logger.info('✅ Bot restart completed successfully');
        logger.info('='.repeat(50));
      } else {
        logger.warn('Bot restart completed but bot is not running (possibly no token configured)');
      }

      return newBot;
    } catch (error: any) {
      logger.error(`Error during bot restart: ${error.message}`);
      logger.error(`Error stack: ${error.stack}`);
      logger.info('='.repeat(50));
      // Return null but don't crash
      return null;
    }
  }

  /**
   * Get current bot instance
   */
  public getBot(): TelegramBot | null {
    return this.bot;
  }

  /**
   * Check if bot is initialized
   */
  public isReady(): boolean {
    return this.isInitialized && this.bot !== null;
  }
}

export default BotManager.getInstance();
