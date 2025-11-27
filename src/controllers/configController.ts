import { Request, Response } from 'express';
import configManager from '../config/configManager';
import botManager from '../services/telegram/botManager';
import logger from '../utils/logger';

class ConfigController {
  /**
   * Get current configuration
   */
  async getConfig(_req: Request, res: Response): Promise<void> {
    try {
      const config = configManager.getConfigForUI();
      res.json({ success: true, config });
    } catch (error: any) {
      logger.error(`Failed to get config: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Update configuration
   */
  async updateConfig(req: Request, res: Response): Promise<void> {
    try {
      const updates = req.body;

      logger.info('Received config update request');

      // Get old config to check if telegram token changed
      const oldConfig = configManager.getConfig();
      const oldToken = oldConfig.telegram.botToken;

      const result = await configManager.updateConfig(updates);

      if (result.success) {
        // Check if telegram token changed
        const newConfig = configManager.getConfig();
        const newToken = newConfig.telegram.botToken;

        const tokenChanged = oldToken !== newToken;

        // Restart bot if token changed
        if (tokenChanged) {
          logger.info('🔄 Telegram token changed, restarting bot...');

          // Restart bot in background (don't wait for it)
          botManager.restartBot().then((bot) => {
            if (bot) {
              logger.info('✅ Telegram bot restarted successfully');
            } else {
              logger.info('ℹ️  Telegram bot stopped (token removed or invalid)');
            }
          }).catch((error: any) => {
            logger.error(`Failed to restart bot: ${error.message}`);
          });

          res.json({
            success: true,
            message: 'Configuration updated successfully. Telegram bot is restarting...',
            config: configManager.getConfigForUI(),
            botRestarting: true,
          });
        } else {
          res.json({
            success: true,
            message: 'Configuration updated successfully',
            config: configManager.getConfigForUI(),
          });
        }
      } else {
        res.status(400).json({
          success: false,
          errors: result.errors,
          config: configManager.getConfigForUI(),
        });
      }
    } catch (error: any) {
      logger.error(`Failed to update config: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Get default configuration values
   */
  async getDefaults(_req: Request, res: Response): Promise<void> {
    try {
      const defaults = {
        ai: {
          defaultProvider: 'claude',
          backupAI: true,
          temperature: 0.7,
          claude: {
            model: 'claude-sonnet-4-5-20250929',
            titleMaxTokens: 2000,
            outlineMaxTokens: 8000,
            articleMaxTokens: 25000,
            inputPrice: 3.0,
            outputPrice: 15.0,
          },
          openRouter: {
            model: 'anthropic/claude-sonnet-4.5',
          },
        },
        rateLimit: {
          enabled: true,
          maxRequestsPerMinute: 10,
          aiRequestTimeout: 600000,
          aiTitleTimeout: 180000,
          aiOutlineTimeout: 360000,
          aiArticleTimeout: 600000,
        },
        logging: {
          level: 'info',
        },
      };

      res.json({ success: true, defaults });
    } catch (error: any) {
      logger.error(`Failed to get defaults: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default new ConfigController();
