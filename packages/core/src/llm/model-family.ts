/**
 * Model Family Detection
 *
 * Single source of truth for determining model family from model ID.
 * Used by LLMJudge, LLMGenerator, and UserSimulator.
 */

import { ModelFamily } from './types';

/**
 * Determine model family from Bedrock model ID
 *
 * Handles various model ID formats:
 * - bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0
 * - us.anthropic.claude-sonnet-4-20250514-v1:0 (cross-region)
 * - amazon.nova-pro-v1:0
 * - meta.llama3-70b-instruct-v1:0
 * - deepseek.v3-v1:0
 *
 * @param modelId - The model ID (may include bedrock: prefix or region prefix)
 * @returns The model family
 * @throws Error if model family is not supported
 */
export function getModelFamily(modelId: string): ModelFamily {
  // Remove bedrock: prefix and cross-region prefixes (us., eu., apac., au., etc.)
  const cleanId = modelId
    .replace('bedrock:', '')
    .replace(/^(us|eu|apac|au)\./i, '')
    .toLowerCase();

  if (cleanId.includes('anthropic') || cleanId.includes('claude')) {
    return 'anthropic';
  }
  if (cleanId.includes('amazon.nova') || cleanId.includes('nova')) {
    return 'nova';
  }
  if (cleanId.includes('meta.llama')) {
    return 'meta';
  }
  if (cleanId.includes('qwen.')) {
    return 'qwen';
  }
  if (cleanId.includes('openai.')) {
    return 'openai';
  }
  if (cleanId.includes('deepseek.')) {
    return 'deepseek';
  }

  throw new Error(`Unsupported model family: ${modelId}`);
}

/**
 * Clean model ID for Bedrock API call
 * Removes the bedrock: prefix if present
 *
 * @param modelId - The model ID (may include bedrock: prefix)
 * @returns Clean model ID for Bedrock API
 */
export function cleanModelId(modelId: string): string {
  return modelId.replace('bedrock:', '');
}
