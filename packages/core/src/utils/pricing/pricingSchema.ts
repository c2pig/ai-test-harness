/**
 * Pricing Configuration Schema
 *
 * Zod validation schema for config/shared/pricing.yaml
 */

import { z } from 'zod';

/**
 * Schema for individual model pricing
 */
export const ModelPricingSchema = z.object({
  inputPer1kTokens: z.number().nonnegative(),
  outputPer1kTokens: z.number().nonnegative(),
});

/**
 * Schema for the entire pricing configuration
 * Maps model IDs to their pricing
 */
export const PricingConfigSchema = z.record(z.string(), ModelPricingSchema);

/**
 * Inferred types from schemas
 */
export type ModelPricingConfig = z.infer<typeof ModelPricingSchema>;
export type PricingConfig = z.infer<typeof PricingConfigSchema>;
