import { pricingService } from './pricing/PricingService';
import { ModelPricing } from './pricing/types';

// Export types for backwards compatibility
export { ModelPricing };

/**
 * Calculate cost for LLM usage
 * Now uses AWS Pricing API with caching and static fallback
 *
 * @param modelId Bedrock model ID
 * @param inputTokens Number of input tokens
 * @param outputTokens Number of output tokens
 * @param region AWS region (defaults to us-east-1)
 * @returns Total cost in USD
 */
export async function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  region: string = 'us-east-1'
): Promise<number> {
  return pricingService.calculateCost(modelId, inputTokens, outputTokens, region);
}

/**
 * Get pricing information for a specific model
 *
 * @param modelId Bedrock model ID
 * @param region AWS region (defaults to us-east-1)
 * @returns Model pricing or null if not found
 */
export async function getPricing(
  modelId: string,
  region: string = 'us-east-1'
): Promise<ModelPricing | null> {
  try {
    return await pricingService.getPricing(modelId, region);
  } catch {
    return null;
  }
}

/**
 * Clear all pricing caches (memory + file)
 */
export function clearPricingCache(): void {
  pricingService.clearCache();
}
