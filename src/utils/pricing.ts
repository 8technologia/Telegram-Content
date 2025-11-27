import { config } from '../config';

/**
 * Calculate AI API cost
 *
 * Note: Both Claude and OpenRouter use the same model (Claude Sonnet 4.5).
 * OpenRouter pricing for anthropic/claude-sonnet-4.5 is the same as direct Claude API.
 * Therefore, we use Claude's pricing config for cost estimation for both providers.
 */
export function calculateCost(
  _provider: 'claude' | 'openrouter',
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = config.ai.claude;

  // Price per million tokens
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPrice;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPrice;

  return inputCost + outputCost;
}

/**
 * Format cost in USD
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${(cost * 100).toFixed(4)}¢`;
  }
  return `$${cost.toFixed(4)}`;
}

/**
 * Format time duration
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}
