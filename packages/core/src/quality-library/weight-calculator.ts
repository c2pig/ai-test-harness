/**
 * Weight Calculator Utility
 *
 * Provides functions for calculating weighted quality scores based on
 * business impact weights defined in quality attribute definitions.
 */

import { getAttributeDefinitions } from './index';

/**
 * Fetches weights for specified quality attributes from their definitions
 *
 * @param attributeNames - Array of quality attribute names
 * @returns Record mapping attribute name to weight (0-1 scale)
 */
export async function getAttributeWeights(
  attributeNames: string[]
): Promise<Record<string, number>> {
  const definitions = await getAttributeDefinitions(attributeNames);
  const weights: Record<string, number> = {};

  for (const name of attributeNames) {
    const definition = definitions[name];
    if (definition && typeof definition.weight === 'number') {
      weights[name] = definition.weight;
    } else {
      // Default to 0 if weight not found (will be handled by renormalization)
      console.warn(`[WeightCalculator] No weight found for attribute: ${name}, defaulting to 0`);
      weights[name] = 0;
    }
  }

  return weights;
}

/**
 * Calculates simple weighted score for a single attribute
 *
 * @param score - Quality score (1-5 scale)
 * @param weight - Business impact weight (0-1 scale)
 * @returns Weighted contribution (score × weight)
 */
export function calculateWeightedScore(score: number, weight: number): number {
  return score * weight;
}

/**
 * Renormalizes weights when some attributes are omitted
 * Ensures weights sum to 1.0 for fair comparison
 *
 * @param weights - Original weights for all attributes
 * @param applicableAttributes - Attributes that were actually evaluated
 * @returns Renormalized weights that sum to 1.0
 */
export function renormalizeWeights(
  weights: Record<string, number>,
  applicableAttributes: string[]
): Record<string, number> {
  // Calculate total weight of applicable attributes
  const totalApplicableWeight = applicableAttributes.reduce(
    (sum, attr) => sum + (weights[attr] || 0),
    0
  );

  // If no applicable weight, return equal weights
  if (totalApplicableWeight === 0) {
    const equalWeight = 1.0 / applicableAttributes.length;
    const renormalized: Record<string, number> = {};
    for (const attr of applicableAttributes) {
      renormalized[attr] = equalWeight;
    }
    return renormalized;
  }

  // Renormalize: scale each weight so sum = 1.0
  const renormalized: Record<string, number> = {};
  for (const attr of applicableAttributes) {
    renormalized[attr] = (weights[attr] || 0) / totalApplicableWeight;
  }

  return renormalized;
}

/**
 * Calculates both simple average and weighted average for quality assessment
 *
 * @param assessment - Quality assessment with scores per attribute
 * @param weights - Business impact weights per attribute
 * @returns Object containing average, weightedAverage, and contribution breakdown
 */
export function calculateWeightedAverage(
  assessment: Record<string, { score: number; [key: string]: any }>,
  weights: Record<string, number>
): {
  average: number;
  weightedAverage: number;
  contributions: Record<string, number>;
  renormalizedWeights: Record<string, number>;
} {
  // Filter to only evaluated attributes (exclude nulls/omitted)
  const evaluated = Object.entries(assessment).filter(
    ([_, data]) => data.score !== null && data.score !== undefined
  );

  // Handle edge case: no evaluated attributes
  if (evaluated.length === 0) {
    return {
      average: 0,
      weightedAverage: 0,
      contributions: {},
      renormalizedWeights: {},
    };
  }

  // Calculate simple average (all attributes equal)
  const totalScore = evaluated.reduce((sum, [_, data]) => sum + data.score, 0);
  const average = totalScore / evaluated.length;

  // Get list of evaluated attribute names
  const applicableAttributes = evaluated.map(([attr]) => attr);

  // Renormalize weights for only the evaluated attributes
  const renormalizedWeights = renormalizeWeights(weights, applicableAttributes);

  // Calculate weighted sum and contributions
  const contributions: Record<string, number> = {};
  let weightedSum = 0;

  for (const [attr, data] of evaluated) {
    const weight = renormalizedWeights[attr] || 0;
    const contribution = data.score * weight;
    contributions[attr] = contribution;
    weightedSum += contribution;
  }

  // Weighted average (should be on 1-5 scale since renormalized weights sum to 1.0)
  const weightedAverage = weightedSum;

  return {
    average: parseFloat(average.toFixed(2)),
    weightedAverage: parseFloat(weightedAverage.toFixed(2)),
    contributions,
    renormalizedWeights,
  };
}

/**
 * Calculates weighted contribution for a single attribute
 * Uses original (non-renormalized) weight
 *
 * @param score - Quality score (1-5 scale)
 * @param weight - Original business impact weight (0-1 scale)
 * @returns Weighted contribution (score × weight)
 */
export function calculateContribution(score: number, weight: number): number {
  return parseFloat((score * weight).toFixed(2));
}

/**
 * Calculates grouped weighted averages with dynamic category bucketing
 *
 * @param assessment - Quality assessment with scores per attribute
 * @param weights - Business impact weights per attribute
 * @param categories - Category assignment per attribute (any string category name)
 * @returns Score breakdowns by category and overall
 */
export function calculateGroupedWeightedAverages(
  assessment: Record<string, { score: number; [key: string]: any }>,
  weights: Record<string, number>,
  categories: Record<string, string>
): {
  byCategory: Record<string, { average: number; weightedAverage: number }>;
  overall: { average: number; weightedAverage: number };
} {
  // Group attributes by category dynamically
  const grouped: Record<string, Record<string, { score: number; [key: string]: any }>> = {};
  const groupedWeights: Record<string, Record<string, number>> = {};

  for (const [attr, data] of Object.entries(assessment)) {
    if (data.score === null || data.score === undefined) continue;

    const category = categories[attr] || 'other'; // Default to 'other' if not specified

    if (!grouped[category]) {
      grouped[category] = {};
      groupedWeights[category] = {};
    }

    grouped[category][attr] = data;
    groupedWeights[category][attr] = weights[attr] || 0;
  }

  // Calculate scores for each discovered category
  const byCategory: Record<string, { average: number; weightedAverage: number }> = {};

  for (const [cat, attrs] of Object.entries(grouped)) {
    const result = calculateWeightedAverage(attrs, groupedWeights[cat]);
    byCategory[cat] = {
      average: result.average,
      weightedAverage: result.weightedAverage,
    };
  }

  // Calculate overall (combined) scores
  const overallResult = calculateWeightedAverage(assessment, weights);

  return {
    byCategory,
    overall: {
      average: overallResult.average,
      weightedAverage: overallResult.weightedAverage,
    },
  };
}
