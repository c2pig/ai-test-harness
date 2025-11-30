/**
 * Request Builder
 *
 * Build Bedrock request body based on model family.
 * Single source of truth for request format per model family.
 */

import { ModelFamily, InferenceConfig } from './types';

/**
 * Build Bedrock request body based on model family
 *
 * Each model family has a different request format:
 * - Anthropic: Messages API with snake_case
 * - Nova: Messages API with camelCase inferenceConfig
 * - Meta: Llama-specific prompt format
 * - Qwen/OpenAI/DeepSeek: OpenAI-compatible messages format
 *
 * @param modelFamily - The model family
 * @param prompt - The prompt/message to send
 * @param config - Inference configuration
 * @returns Request body object for Bedrock API
 */
export function buildRequestBody(
  modelFamily: ModelFamily,
  prompt: string,
  config: InferenceConfig
): Record<string, unknown> {
  const { temperature, topP, maxTokens } = config;

  switch (modelFamily) {
    case 'anthropic':
      return buildAnthropicRequest(prompt, temperature, topP, maxTokens);

    case 'nova':
      return buildNovaRequest(prompt, temperature, topP, maxTokens);

    case 'meta':
      return buildMetaRequest(prompt, temperature, topP, maxTokens);

    case 'qwen':
    case 'openai':
    case 'deepseek':
      return buildOpenAICompatibleRequest(prompt, temperature, topP, maxTokens);

    default:
      throw new Error(`Unsupported model family for request building: ${modelFamily}`);
  }
}

/**
 * Anthropic Claude Messages API format (snake_case)
 */
function buildAnthropicRequest(
  prompt: string,
  temperature: number,
  topP: number,
  maxTokens: number
): Record<string, unknown> {
  const request: Record<string, unknown> = {
    anthropic_version: 'bedrock-2023-05-31',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature,
  };

  // Only include topP if it's not the default value of 1.0
  if (topP !== 1.0) {
    request.top_p = topP;
  }

  return request;
}

/**
 * Amazon Nova format (camelCase in inferenceConfig)
 */
function buildNovaRequest(
  prompt: string,
  temperature: number,
  topP: number,
  maxTokens: number
): Record<string, unknown> {
  const inferenceConfig: Record<string, unknown> = {
    maxTokens,
    temperature,
  };

  // Only include topP if it's not the default value of 1.0
  if (topP !== 1.0) {
    inferenceConfig.topP = topP;
  }

  return {
    schemaVersion: 'messages-v1',
    messages: [{ role: 'user', content: [{ text: prompt }] }],
    inferenceConfig,
  };
}

/**
 * Meta Llama format with special prompt template
 */
function buildMetaRequest(
  prompt: string,
  temperature: number,
  topP: number,
  maxTokens: number
): Record<string, unknown> {
  const request: Record<string, unknown> = {
    prompt: `<|begin_of_text|><|start_header_id|>user<|end_header_id|>\n\n${prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n`,
    max_gen_len: maxTokens,
    temperature,
  };

  if (topP !== 1.0) {
    request.top_p = topP;
  }

  return request;
}

/**
 * OpenAI-compatible format (Qwen, OpenAI GPT-OSS, DeepSeek)
 */
function buildOpenAICompatibleRequest(
  prompt: string,
  temperature: number,
  topP: number,
  maxTokens: number
): Record<string, unknown> {
  const request: Record<string, unknown> = {
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature,
  };

  if (topP !== 1.0) {
    request.top_p = topP;
  }

  return request;
}

