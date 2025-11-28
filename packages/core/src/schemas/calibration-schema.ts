/**
 * Calibration Configuration Schema
 *
 * Zod schema for calibration.yaml files used in quality assessment
 */

import { z } from 'zod';

/**
 * Calibration example schema
 *
 * Each example provides a reference case for quality assessment calibration
 */
export const CalibrationExampleSchema = z.object({
  /**
   * Category/classification of this calibration example
   */
  category: z.string().min(1, 'category is required'),

  /**
   * Detailed description of the example scenario
   */
  description: z.string().min(1, 'description is required'),

  /**
   * Guidance on how to judge this type of example
   */
  guidance: z.string().min(1, 'guidance is required'),

  /**
   * Expected quality ratings for applicable attributes
   * Key: quality attribute name
   * Value: rating score (1-5 scale)
   *
   * Note: Only include ratings for applicable attributes.
   * Non-applicable attributes should be omitted.
   */
  expectedRating: z
    .record(z.string(), z.number().int().min(1).max(5, 'rating must be between 1 and 5'))
    .refine(ratings => Object.keys(ratings).length > 0, {
      message: 'expectedRating must have at least one attribute rating',
    }),
});

/**
 * Calibration configuration schema
 *
 * Controls whether calibration is used and provides calibration examples
 */
export const CalibrationConfigSchema = z
  .object({
    /**
     * Whether calibration is enabled for quality assessment
     */
    enabled: z.boolean(),

    /**
     * Array of calibration examples
     * Required when enabled is true
     */
    examples: z.array(CalibrationExampleSchema).min(0),
  })
  .refine(
    data => {
      // If enabled is true, examples array must not be empty
      if (data.enabled && data.examples.length === 0) {
        return false;
      }
      return true;
    },
    {
      message: 'When calibration is enabled, examples array must contain at least one example',
      path: ['examples'],
    }
  );

// ============================================================================
// Type Exports
// ============================================================================

export type CalibrationExample = z.infer<typeof CalibrationExampleSchema>;
export type CalibrationConfig = z.infer<typeof CalibrationConfigSchema>;
