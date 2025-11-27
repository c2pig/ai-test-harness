/**
 * Static Pricing Loader
 *
 * Loads model pricing from config/shared/pricing.yaml
 * Used as fallback when AWS Pricing API is unavailable
 *
 * Source: https://aws.amazon.com/bedrock/pricing/
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { ModelPricing } from './types';
import { PricingConfigSchema } from './pricingSchema';
import { Logger } from '../logger';

/**
 * Cached pricing data (loaded once on first access)
 */
let cachedPricing: Record<string, ModelPricing> | null = null;

/**
 * Path to pricing configuration file
 */
const PRICING_CONFIG_PATH = 'config/shared/pricing.yaml';

/**
 * Load and validate pricing configuration from YAML file
 *
 * @returns Record of model IDs to pricing, or empty object on error
 */
function loadPricingConfig(): Record<string, ModelPricing> {
  // Return cached data if available
  if (cachedPricing) {
    return cachedPricing;
  }

  const configPath = path.join(process.cwd(), PRICING_CONFIG_PATH);

  try {
    // Check if file exists
    if (!fs.existsSync(configPath)) {
      Logger.warn(`[Pricing] Config file not found: ${configPath}`);
      cachedPricing = {};
      return cachedPricing;
    }

    // Read and parse YAML
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = yaml.parse(content);

    // Validate against schema
    const validated = PricingConfigSchema.parse(parsed);

    // Cache the result
    cachedPricing = validated;

    Logger.info(
      `[Pricing] ✓ Loaded pricing for ${Object.keys(cachedPricing).length} models from ${PRICING_CONFIG_PATH}`
    );

    return cachedPricing;
  } catch (error) {
    if (error instanceof Error) {
      Logger.error(`[Pricing] ✗ Failed to load pricing config: ${error.message}`);
    } else {
      Logger.error('[Pricing] ✗ Failed to load pricing config', error);
    }

    // Return empty object as fallback
    cachedPricing = {};
    return cachedPricing;
  }
}

/**
 * Get static pricing for a specific model
 *
 * @param modelId - The model identifier (e.g., "anthropic.claude-3-5-sonnet-20241022-v2:0")
 * @returns ModelPricing if found, null otherwise
 */
export function getStaticPricing(modelId: string): ModelPricing | null {
  const pricing = loadPricingConfig();
  return pricing[modelId] || null;
}

/**
 * Get all available static pricing data
 *
 * @returns Record of all model IDs to pricing
 */
export function getAllStaticPricing(): Record<string, ModelPricing> {
  return loadPricingConfig();
}

/**
 * Check if static pricing is available for a model
 *
 * @param modelId - The model identifier
 * @returns true if pricing exists
 */
export function hasStaticPricing(modelId: string): boolean {
  const pricing = loadPricingConfig();
  return modelId in pricing;
}

/**
 * Clear the pricing cache (useful for testing or reloading)
 */
export function clearPricingCache(): void {
  cachedPricing = null;
  Logger.info('[Pricing] Cache cleared');
}
