/**
 * Rating Label Extraction Utility
 *
 * Extracts rating labels from quality attribute definitions to ensure
 * the judge prompt and schema validation use consistent, up-to-date labels.
 *
 * This module provides the single source of truth for rating labels,
 * derived directly from QualityAttributeDefinition.rating objects.
 */

import { Logger } from '../utils/logger';

import { getAttributeDefinitions } from './registry';
import { QualityAttributeDefinition } from './types';

/**
 * Rating labels for each score level (1-5)
 */
export interface RatingLabels {
  '1': string;
  '2': string;
  '3': string;
  '4': string;
  '5': string;
}

/**
 * Default rating labels used as fallback when no attributes are loaded
 * or when quality attributes have inconsistent labels
 */
const DEFAULT_RATING_LABELS: RatingLabels = {
  '1': 'Not Acceptable',
  '2': 'Needs Improvement',
  '3': 'Acceptable',
  '4': 'Good',
  '5': 'Excellent',
};

/**
 * Extract unique rating labels from quality attribute definitions
 *
 * Strategy:
 * 1. Collect all labels from all attributes
 * 2. For each score level (1-5), select the most common label
 * 3. If there's a tie or no data, use the default label
 *
 * @param attributeNames - List of quality attribute names to analyze
 * @returns Rating labels for scores 1-5
 */
export async function extractRatingLabels(attributeNames: string[]): Promise<RatingLabels> {
  if (attributeNames.length === 0) {
    return DEFAULT_RATING_LABELS;
  }

  try {
    const definitions = await getAttributeDefinitions(attributeNames);

    // Collect labels for each score level across all attributes
    const labelsPerScore: Record<string, Record<string, number>> = {
      '1': {},
      '2': {},
      '3': {},
      '4': {},
      '5': {},
    };

    for (const attrName of attributeNames) {
      const def: QualityAttributeDefinition | undefined = definitions[attrName];
      if (!def || !def.rating) continue;

      // Count occurrences of each label at each score level
      for (const score of ['1', '2', '3', '4', '5'] as const) {
        const label = def.rating[score]?.label;
        if (label) {
          labelsPerScore[score][label] = (labelsPerScore[score][label] || 0) + 1;
        }
      }
    }

    // Select most common label for each score level
    const result: any = {};
    for (const score of ['1', '2', '3', '4', '5'] as const) {
      const labelCounts = labelsPerScore[score];
      const labels = Object.keys(labelCounts);

      if (labels.length === 0) {
        // No labels found - use default
        result[score] = DEFAULT_RATING_LABELS[score];
      } else {
        // Find most common label
        const mostCommon = labels.reduce((a, b) => (labelCounts[a] > labelCounts[b] ? a : b));
        result[score] = mostCommon;
      }
    }

    return result as RatingLabels;
  } catch (error) {
    Logger.warn('[RatingLabels] Failed to extract labels from attributes, using defaults:', error);
    return DEFAULT_RATING_LABELS;
  }
}

/**
 * Generate rating guidelines text for judge prompt
 *
 * Format:
 * - Rating 1 (Not Acceptable): Critical failures...
 * - Rating 2 (Needs Improvement): Significant issues...
 * ...
 *
 * @param labels - Rating labels for each score
 * @param includeDescriptions - Whether to include generic descriptions
 * @returns Formatted rating guidelines text
 */
export function generateRatingGuidelinesText(
  labels: RatingLabels,
  includeDescriptions: boolean = true
): string {
  const descriptions = {
    '1': 'Critical failures, major violations of requirements, completely misses core expectations',
    '2': 'Significant issues, notable problems, substantial gaps in execution or quality',
    '3': 'Meets minimum requirements, some issues present but functional, baseline quality achieved',
    '4': 'Above expectations, minor issues only, generally well-executed with strong adherence to requirements',
    '5': 'Exceeds all expectations, flawless execution, exemplary quality with no identifiable issues',
  };

  const lines: string[] = [];
  for (const score of ['1', '2', '3', '4', '5'] as const) {
    const label = labels[score];
    if (includeDescriptions) {
      lines.push(`- Rating ${score} (${label}): ${descriptions[score]}`);
    } else {
      lines.push(`- Rating ${score} (${label})`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate score-to-grade mapping text for judge prompt
 *
 * Format:
 * * score: 1 ⟹ grade: "Not Acceptable"
 * * score: 2 ⟹ grade: "Needs Improvement"
 * ...
 *
 * @param labels - Rating labels for each score
 * @returns Formatted score-to-grade mapping
 */
export function generateScoreToGradeMappingText(labels: RatingLabels): string {
  const lines: string[] = [];
  for (const score of ['1', '2', '3', '4', '5'] as const) {
    lines.push(`  * score: ${score} ⟹ grade: "${labels[score]}"`);
  }
  return lines.join('\n');
}

/**
 * Get rating labels as an array (for Zod enum generation)
 *
 * @param labels - Rating labels object
 * @returns Array of unique labels in score order (1-5)
 */
export function getRatingLabelsArray(labels: RatingLabels): string[] {
  // Preserve order: score 1 to 5
  const ordered = [labels['1'], labels['2'], labels['3'], labels['4'], labels['5']];

  // Remove duplicates while preserving order
  return [...new Set(ordered)];
}
