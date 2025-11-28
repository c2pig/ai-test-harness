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
 * Load pricing from a single YAML file
 *
 * @param configPath - Absolute path to the pricing YAML file
 * @returns Record of model IDs to pricing, or null if file not found/invalid
 */
function loadPricingFromFile(configPath: string): Record<string, ModelPricing> | null {
  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }

    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = yaml.parse(content);

    // Handle empty or comment-only files
    if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) {
      return null;
    }

    // Validate against schema
    const validated = PricingConfigSchema.parse(parsed);
    return validated;
  } catch {
    return null;
  }
}

/**
 * Load and validate pricing configuration from YAML file
 * First loads core package pricing, then merges with project-level overrides
 *
 * @returns Record of model IDs to pricing, or empty object on error
 */
function loadPricingConfig(): Record<string, ModelPricing> {
  // Return cached data if available
  if (cachedPricing) {
    return cachedPricing;
  }

  // Start with empty pricing
  let mergedPricing: Record<string, ModelPricing> = {};

  // 1. Load core package pricing (bundled with @ai-test-harness/core)
  // __dirname points to dist/utils/pricing, so go up to package root
  const coreConfigPath = path.join(__dirname, '..', '..', '..', 'config', 'shared', 'pricing.yaml');
  const corePricing = loadPricingFromFile(coreConfigPath);
  if (corePricing) {
    mergedPricing = { ...corePricing };
    Logger.info(
      `[Pricing] ✓ Loaded ${Object.keys(corePricing).length} models from core package`
    );
  }

  // 2. Load project-level pricing (overrides core pricing)
  const projectConfigPath = path.join(process.cwd(), PRICING_CONFIG_PATH);
  const projectPricing = loadPricingFromFile(projectConfigPath);
  if (projectPricing && Object.keys(projectPricing).length > 0) {
    mergedPricing = { ...mergedPricing, ...projectPricing };
    Logger.info(
      `[Pricing] ✓ Merged ${Object.keys(projectPricing).length} models from project config`
    );
  }

  // Cache the result
  cachedPricing = mergedPricing;

  if (Object.keys(cachedPricing).length === 0) {
    Logger.warn('[Pricing] No pricing data loaded from any source');
  }

  return cachedPricing;
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
