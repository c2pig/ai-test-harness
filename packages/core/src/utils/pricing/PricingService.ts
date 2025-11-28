import { Logger } from '../logger';
import { ModelPricing } from './types';
import { AwsPricingClient } from './AwsPricingClient';
import { PricingCache } from './PricingCache';
import { getStaticPricing } from './staticPricing';

export class PricingService {
  private awsClient: AwsPricingClient;
  private cache: PricingCache;
  private enabled: boolean;
  private fetchPromise: Promise<void> | null = null;
  private pricingData: Map<string, ModelPricing> = new Map();

  constructor(
    // AWS Pricing API disabled by default - enable with AWS_PRICING_ENABLED=true
    // Static pricing is accurate and avoids API rate limits
    enabled: boolean = process.env.AWS_PRICING_ENABLED === 'true',
    cacheDir?: string
  ) {
    this.enabled = enabled;
    this.awsClient = new AwsPricingClient();
    this.cache = new PricingCache(cacheDir);

    Logger.info(
      `[PricingService] ${this.enabled ? 'Using AWS Pricing API with static fallback' : 'Using static pricing only'}`
    );
  }

  async getPricing(modelId: string, region: string = 'us-east-1'): Promise<ModelPricing> {
    // Try memory cache
    const memoryCached = this.cache.getFromMemory(modelId, region);
    if (memoryCached) {
      return memoryCached;
    }

    // Try file cache
    const fileCached = await this.cache.getFromFile(modelId, region);
    if (fileCached) {
      return fileCached;
    }

    // Try AWS API (if enabled)
    if (this.enabled) {
      try {
        const apiPricing = await this.fetchFromAws(modelId, region);
        if (apiPricing) {
          this.cache.set(modelId, region, apiPricing);
          return apiPricing;
        }
      } catch (error) {
        Logger.warn(`[PricingService] AWS API failed for ${modelId}: ${error}`);
      }
    }

    // Fallback to static pricing
    const staticPricing = getStaticPricing(modelId);
    if (staticPricing) {
      return staticPricing;
    }

    // No pricing found - return zero cost
    Logger.warn(`[PricingService] No pricing found for ${modelId}, returning zero cost`);
    return {
      inputPer1kTokens: 0,
      outputPer1kTokens: 0,
    };
  }

  private async fetchFromAws(modelId: string, region: string): Promise<ModelPricing | null> {
    // Ensure we only fetch once at a time
    if (this.fetchPromise) {
      await this.fetchPromise;
    }

    // Check if we already have this model from a previous fetch
    if (this.pricingData.size > 0) {
      const pricing = this.pricingData.get(modelId);
      if (pricing) return pricing;
    }

    // Fetch all pricing data
    this.fetchPromise = (async () => {
      try {
        this.pricingData = await this.awsClient.fetchPricing(region);

        // Cache all fetched pricing
        for (const [mid, pricing] of this.pricingData.entries()) {
          this.cache.set(mid, region, pricing);
        }
      } finally {
        this.fetchPromise = null;
      }
    })();

    await this.fetchPromise;

    return this.pricingData.get(modelId) || null;
  }

  async calculateCost(
    modelId: string,
    inputTokens: number,
    outputTokens: number,
    region: string = 'us-east-1'
  ): Promise<number> {
    const pricing = await this.getPricing(modelId, region);

    const inputCost = (inputTokens / 1000) * pricing.inputPer1kTokens;
    const outputCost = (outputTokens / 1000) * pricing.outputPer1kTokens;

    return inputCost + outputCost;
  }

  clearCache(): void {
    this.cache.clearAll();
    this.pricingData.clear();
    Logger.info('[PricingService] All caches cleared');
  }
}

// Singleton instance
export const pricingService = new PricingService();
