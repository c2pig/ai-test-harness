export interface ModelPricing {
  inputPer1kTokens: number;
  outputPer1kTokens: number;
  region?: string;
  lastUpdated?: string;
}

export interface CachedPricing extends ModelPricing {
  modelId: string;
  timestamp: number;
}

export interface PricingCacheEntry {
  pricing: ModelPricing;
  expiresAt: number;
}
