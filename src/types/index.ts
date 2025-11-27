// Types and Interfaces

export interface AIProvider {
  name: 'claude' | 'openrouter';
  model: string;
  apiKey: string;
}

export interface ContentRequest {
  topic: string;
  userId: string;
  chatId: number;
}

export interface ArticleTitle {
  title: string;
  titleNumber: string;
}

export interface ArticleTitlesResponse {
  titles: ArticleTitle[];
  provider: string;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface OutlineRequest {
  title: string;
  userId: string;
  chatId: number;
}

export interface OutlineInference {
  targetKeyword: string;
  targetAudience: string;
  contentPurpose: string;
  estimatedWordCount: string;
}

export interface OutlineSection {
  heading: string;
  subheadings?: string[];
  notes?: string;
}

export interface ArticleOutline {
  inference: OutlineInference;
  outline: OutlineSection[];
}

export interface OutlineResponse {
  outline: ArticleOutline;
  provider: string;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  processingTime?: number;
}

export interface Article {
  content: string;
  contentHtml?: string; // WordPress-ready HTML (optional for backward compatibility)
  metaDescription: string;
  wordCount: number;
  suggestedTags: string[];
}

export interface ArticleResponse {
  article: Article;
  provider: string;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  processingTime?: number;
}

export interface ConversationState {
  userId: string;
  chatId: number;
  step: 'idle' | 'waiting_topic' | 'waiting_title_selection' | 'outline_generated';
  topic?: string;
  generatedTitles?: ArticleTitle[];
  selectedTitle?: string;
  generatedOutline?: ArticleOutline;
  lastActivity: Date;
  isProcessing?: boolean;
  processingTask?: 'titles' | 'outline' | 'article';
  lockAcquiredAt?: Date;
}

export interface RateLimitInfo {
  userId: string;
  requestCount: number;
  windowStart: number;
}

export interface AIResponse<T> {
  data: T;
  provider: string;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  cached: boolean;
  processingTime: number;
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  webhookUrl: string;
  telegram: {
    botToken: string;
    botMode: 'polling' | 'webhook';
    secretToken?: string;
  };
  ai: {
    defaultProvider: 'claude' | 'openrouter';
    backupAI: boolean;
    claude: {
      apiKey: string;
      model: string;
      titleMaxTokens: number;
      outlineMaxTokens: number;
      articleMaxTokens: number;
      inputPrice: number;
      outputPrice: number;
    };
    openRouter: {
      apiKey: string;
      model: string;
    };
    temperature: number;
  };
  rateLimit: {
    enabled: boolean;
    maxRequestsPerMinute: number;
    aiRequestTimeout: number;
    aiTitleTimeout?: number;
    aiOutlineTimeout?: number;
    aiArticleTimeout?: number;
  };
  features: {};
  logging: {
    level: LogLevel;
  };
}
