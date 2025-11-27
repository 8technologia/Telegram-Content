import fs from 'fs';
import path from 'path';
import { AppConfig } from '../types';

// Simple logger to avoid circular dependency during initialization
const log = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
};

// Lazy load logger to avoid circular dependency
let _logger: any = null;
function getLogger() {
  if (!_logger) {
    try {
      _logger = require('../utils/logger').default;
    } catch {
      _logger = log; // Fallback to simple logger
    }
  }
  return _logger;
}

const CONFIG_FILE_PATH = path.join(process.cwd(), 'config.json');

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: AppConfig = {
  nodeEnv: 'development',
  port: 3333,
  webhookUrl: '',
  telegram: {
    botToken: '',
    botMode: 'polling',
    secretToken: undefined,
  },
  ai: {
    defaultProvider: 'claude',
    backupAI: true,
    claude: {
      apiKey: '',
      model: 'claude-sonnet-4-5-20250929',
      titleMaxTokens: 2000,
      outlineMaxTokens: 8000,
      articleMaxTokens: 25000,
      inputPrice: 3.0,
      outputPrice: 15.0,
    },
    openRouter: {
      apiKey: '',
      model: 'anthropic/claude-sonnet-4.5',
    },
    temperature: 0.7,
  },
  rateLimit: {
    enabled: true,
    maxRequestsPerMinute: 10,
    aiRequestTimeout: 600000,
    aiTitleTimeout: 180000,
    aiOutlineTimeout: 360000,
    aiArticleTimeout: 600000,
  },
  features: {},
  logging: {
    level: 'info',
  },
};

/**
 * ConfigManager - Manages runtime configuration with persistence
 */
class ConfigManager {
  private currentConfig: AppConfig;
  private configuredKeys: Set<string> = new Set();

  constructor() {
    this.currentConfig = this.loadConfig();
    this.markConfiguredKeys();
  }

  /**
   * Load config from file or create default
   */
  private loadConfig(): AppConfig {
    try {
      if (fs.existsSync(CONFIG_FILE_PATH)) {
        const fileContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
        const savedConfig = JSON.parse(fileContent);

        // Merge with defaults to ensure all fields exist
        const config = this.deepMerge(DEFAULT_CONFIG, savedConfig);

        log.info('Configuration loaded from config.json');
        return config;
      } else {
        log.info('No config.json found, creating default configuration');
        this.saveConfigToFile(DEFAULT_CONFIG);
        return { ...DEFAULT_CONFIG };
      }
    } catch (error: any) {
      log.error(`Failed to load config.json: ${error.message}`);
      log.info('Using default configuration');
      return { ...DEFAULT_CONFIG };
    }
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(target: any, source: any): any {
    const output = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        output[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        output[key] = source[key];
      }
    }

    return output;
  }

  /**
   * Mark which keys have been configured (non-empty)
   */
  private markConfiguredKeys(): void {
    if (this.currentConfig.telegram.botToken) this.configuredKeys.add('telegram.botToken');
    if (this.currentConfig.ai.claude.apiKey) this.configuredKeys.add('claude.apiKey');
    if (this.currentConfig.ai.openRouter.apiKey) this.configuredKeys.add('openrouter.apiKey');
    if (this.currentConfig.webhookUrl) this.configuredKeys.add('webhookUrl');
  }

  /**
   * Save config to file
   */
  private saveConfigToFile(config: AppConfig): void {
    try {
      const jsonContent = JSON.stringify(config, null, 2);
      fs.writeFileSync(CONFIG_FILE_PATH, jsonContent, 'utf-8');
      log.info('Configuration saved to config.json');
    } catch (error: any) {
      log.error(`Failed to save config.json: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get current config
   */
  getConfig(): AppConfig {
    return { ...this.currentConfig };
  }

  /**
   * Get config for UI (with sensitive data masked if configured)
   */
  getConfigForUI(): any {
    const config = this.getConfig();

    return {
      webhookUrl: config.webhookUrl,
      telegram: {
        botToken: this.configuredKeys.has('telegram.botToken')
          ? this.maskSensitive(config.telegram.botToken)
          : '',
        botMode: config.telegram.botMode,
        secretToken: config.telegram.secretToken
          ? this.maskSensitive(config.telegram.secretToken)
          : '',
      },
      ai: {
        defaultProvider: config.ai.defaultProvider,
        backupAI: config.ai.backupAI,
        temperature: config.ai.temperature,
        claude: {
          apiKey: this.configuredKeys.has('claude.apiKey')
            ? this.maskSensitive(config.ai.claude.apiKey)
            : '',
          model: config.ai.claude.model,
          titleMaxTokens: config.ai.claude.titleMaxTokens,
          outlineMaxTokens: config.ai.claude.outlineMaxTokens,
          articleMaxTokens: config.ai.claude.articleMaxTokens,
          inputPrice: config.ai.claude.inputPrice,
          outputPrice: config.ai.claude.outputPrice,
        },
        openRouter: {
          apiKey: this.configuredKeys.has('openrouter.apiKey')
            ? this.maskSensitive(config.ai.openRouter.apiKey)
            : '',
          model: config.ai.openRouter.model,
        },
      },
      rateLimit: {
        enabled: config.rateLimit.enabled,
        maxRequestsPerMinute: config.rateLimit.maxRequestsPerMinute,
        aiRequestTimeout: config.rateLimit.aiRequestTimeout,
        aiTitleTimeout: config.rateLimit.aiTitleTimeout,
        aiOutlineTimeout: config.rateLimit.aiOutlineTimeout,
        aiArticleTimeout: config.rateLimit.aiArticleTimeout,
      },
      logging: {
        level: config.logging.level,
      },
      // Include info about which keys are configured
      _configured: Array.from(this.configuredKeys),
    };
  }

  /**
   * Mask sensitive data for display
   */
  private maskSensitive(value: string): string {
    if (!value || value.length < 8) return '***';
    return value.substring(0, 8) + '***' + value.substring(value.length - 4);
  }

  /**
   * Update config at runtime and save to file
   */
  async updateConfig(updates: Partial<any>): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      getLogger().info('Updating configuration...');

      // Webhook URL
      if (updates.webhookUrl !== undefined && updates.webhookUrl !== this.currentConfig.webhookUrl) {
        try {
          new URL(updates.webhookUrl);
          this.currentConfig.webhookUrl = updates.webhookUrl;
          this.configuredKeys.add('webhookUrl');
          getLogger().info('Webhook URL updated');
        } catch (e) {
          errors.push('Invalid webhook URL');
        }
      }

      // Telegram settings
      if (updates.telegram) {
        if (updates.telegram.botToken && updates.telegram.botToken !== this.maskSensitive(this.currentConfig.telegram.botToken)) {
          this.currentConfig.telegram.botToken = updates.telegram.botToken;
          this.configuredKeys.add('telegram.botToken');
          getLogger().info('Telegram bot token updated');
        }

        if (updates.telegram.secretToken !== undefined) {
          this.currentConfig.telegram.secretToken = updates.telegram.secretToken || undefined;
          getLogger().info('Telegram secret token updated');
        }
      }

      // AI settings
      if (updates.ai) {
        // Default provider
        if (updates.ai.defaultProvider &&
            (updates.ai.defaultProvider === 'claude' || updates.ai.defaultProvider === 'openrouter')) {
          this.currentConfig.ai.defaultProvider = updates.ai.defaultProvider;
          getLogger().info(`Default AI provider set to: ${updates.ai.defaultProvider}`);
        }

        // Backup AI
        if (updates.ai.backupAI !== undefined) {
          this.currentConfig.ai.backupAI = updates.ai.backupAI;
          getLogger().info(`Backup AI ${updates.ai.backupAI ? 'enabled' : 'disabled'}`);
        }

        // Temperature
        if (updates.ai.temperature !== undefined) {
          const temp = parseFloat(updates.ai.temperature);
          if (!isNaN(temp) && temp >= 0 && temp <= 2) {
            this.currentConfig.ai.temperature = temp;
            getLogger().info(`Temperature set to: ${temp}`);
          } else {
            errors.push('Temperature must be between 0 and 2');
          }
        }

        // Claude settings
        if (updates.ai.claude) {
          const claude = updates.ai.claude;

          if (claude.apiKey && claude.apiKey !== this.maskSensitive(this.currentConfig.ai.claude.apiKey)) {
            // Validate API key format (basic check)
            if (claude.apiKey.startsWith('sk-ant-')) {
              this.currentConfig.ai.claude.apiKey = claude.apiKey;
              this.configuredKeys.add('claude.apiKey');

              // Reinitialize Claude service with new key
              try {
                const claudeService = (await import('../services/ai/claudeService')).default;
                const Anthropic = require('@anthropic-ai/sdk');
                (claudeService as any).client = new Anthropic({
                  apiKey: claude.apiKey,
                });
                getLogger().info('Claude API key updated and service reinitialized');
              } catch (e: any) {
                errors.push(`Failed to reinitialize Claude service: ${e.message}`);
              }
            } else {
              errors.push('Invalid Claude API key format (must start with sk-ant-)');
            }
          }

          if (claude.model) {
            this.currentConfig.ai.claude.model = claude.model;
            getLogger().info(`Claude model set to: ${claude.model}`);
          }

          if (claude.titleMaxTokens !== undefined) {
            const tokens = parseInt(claude.titleMaxTokens);
            if (!isNaN(tokens) && tokens >= 100 && tokens <= 100000) {
              this.currentConfig.ai.claude.titleMaxTokens = tokens;
            } else {
              errors.push('Title max tokens must be between 100 and 100000');
            }
          }

          if (claude.outlineMaxTokens !== undefined) {
            const tokens = parseInt(claude.outlineMaxTokens);
            if (!isNaN(tokens) && tokens >= 100 && tokens <= 100000) {
              this.currentConfig.ai.claude.outlineMaxTokens = tokens;
            } else {
              errors.push('Outline max tokens must be between 100 and 100000');
            }
          }

          if (claude.articleMaxTokens !== undefined) {
            const tokens = parseInt(claude.articleMaxTokens);
            if (!isNaN(tokens) && tokens >= 100 && tokens <= 100000) {
              this.currentConfig.ai.claude.articleMaxTokens = tokens;
            } else {
              errors.push('Article max tokens must be between 100 and 100000');
            }
          }

          if (claude.inputPrice !== undefined) {
            const price = parseFloat(claude.inputPrice);
            if (!isNaN(price) && price >= 0) {
              this.currentConfig.ai.claude.inputPrice = price;
            }
          }

          if (claude.outputPrice !== undefined) {
            const price = parseFloat(claude.outputPrice);
            if (!isNaN(price) && price >= 0) {
              this.currentConfig.ai.claude.outputPrice = price;
            }
          }
        }

        // OpenRouter settings
        if (updates.ai.openRouter) {
          const openRouter = updates.ai.openRouter;

          if (openRouter.apiKey && openRouter.apiKey !== this.maskSensitive(this.currentConfig.ai.openRouter.apiKey)) {
            // Validate API key format (basic check)
            if (openRouter.apiKey.startsWith('sk-or-')) {
              this.currentConfig.ai.openRouter.apiKey = openRouter.apiKey;
              this.configuredKeys.add('openrouter.apiKey');

              // Reinitialize OpenRouter service with new key
              try {
                const openRouterService = (await import('../services/ai/openRouterService')).default;
                const { OpenRouter } = require('@openrouter/sdk');
                (openRouterService as any).client = new OpenRouter({
                  apiKey: openRouter.apiKey,
                });
                getLogger().info('OpenRouter API key updated and service reinitialized');
              } catch (e: any) {
                errors.push(`Failed to reinitialize OpenRouter service: ${e.message}`);
              }
            } else {
              errors.push('Invalid OpenRouter API key format (must start with sk-or-)');
            }
          }

          if (openRouter.model) {
            this.currentConfig.ai.openRouter.model = openRouter.model;
            getLogger().info(`OpenRouter model set to: ${openRouter.model}`);
          }
        }
      }

      // Rate limit settings
      if (updates.rateLimit) {
        if (updates.rateLimit.enabled !== undefined) {
          this.currentConfig.rateLimit.enabled = updates.rateLimit.enabled;
          getLogger().info(`Rate limiting ${updates.rateLimit.enabled ? 'enabled' : 'disabled'}`);
        }

        if (updates.rateLimit.maxRequestsPerMinute !== undefined) {
          const max = parseInt(updates.rateLimit.maxRequestsPerMinute);
          if (!isNaN(max) && max >= 1 && max <= 1000) {
            this.currentConfig.rateLimit.maxRequestsPerMinute = max;
            getLogger().info(`Max requests per minute set to: ${max}`);
          } else {
            errors.push('Max requests per minute must be between 1 and 1000');
          }
        }

        if (updates.rateLimit.aiRequestTimeout !== undefined) {
          const timeout = parseInt(updates.rateLimit.aiRequestTimeout);
          if (!isNaN(timeout) && timeout >= 1000 && timeout <= 3600000) {
            this.currentConfig.rateLimit.aiRequestTimeout = timeout;
          } else {
            errors.push('AI request timeout must be between 1000 and 3600000');
          }
        }

        if (updates.rateLimit.aiTitleTimeout !== undefined) {
          const timeout = parseInt(updates.rateLimit.aiTitleTimeout);
          if (!isNaN(timeout) && timeout >= 1000 && timeout <= 3600000) {
            this.currentConfig.rateLimit.aiTitleTimeout = timeout;
          }
        }

        if (updates.rateLimit.aiOutlineTimeout !== undefined) {
          const timeout = parseInt(updates.rateLimit.aiOutlineTimeout);
          if (!isNaN(timeout) && timeout >= 1000 && timeout <= 3600000) {
            this.currentConfig.rateLimit.aiOutlineTimeout = timeout;
          }
        }

        if (updates.rateLimit.aiArticleTimeout !== undefined) {
          const timeout = parseInt(updates.rateLimit.aiArticleTimeout);
          if (!isNaN(timeout) && timeout >= 1000 && timeout <= 3600000) {
            this.currentConfig.rateLimit.aiArticleTimeout = timeout;
          }
        }
      }

      // Logging settings
      if (updates.logging?.level) {
        const validLevels = ['info', 'warn', 'error', 'debug'];
        if (validLevels.includes(updates.logging.level)) {
          this.currentConfig.logging.level = updates.logging.level;
          getLogger().info(`Log level set to: ${updates.logging.level}`);
        } else {
          errors.push('Invalid log level');
        }
      }

      // Save to file
      if (errors.length === 0) {
        this.saveConfigToFile(this.currentConfig);
        getLogger().info('Configuration updated successfully and saved to file');
        return { success: true, errors: [] };
      } else {
        getLogger().warn(`Configuration updated with errors: ${errors.join(', ')}`);
        return { success: false, errors };
      }
    } catch (error: any) {
      getLogger().error(`Failed to update configuration: ${error.message}`);
      errors.push(error.message);
      return { success: false, errors };
    }
  }

  /**
   * Check if a key is configured
   */
  isConfigured(key: string): boolean {
    return this.configuredKeys.has(key);
  }
}

// Export singleton
export default new ConfigManager();
