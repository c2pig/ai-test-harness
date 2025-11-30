/**
 * Response Parser
 *
 * Parse Bedrock response based on model family.
 * Single source of truth for response format per model family.
 */

import { ModelFamily, LLMResponse } from './types';

/**
 * Parse Bedrock response based on model family
 *
 * Each model family has a different response format:
 * - Anthropic: content[0].text, usage.input_tokens/output_tokens
 * - Nova: output.message.content[0].text, usage.inputTokens/outputTokens
 * - Meta: generation, prompt_token_count/generation_token_count
 * - Qwen/OpenAI/DeepSeek: choices[0].message.content, usage.prompt_tokens/completion_tokens
 *
 * @param modelFamily - The model family
 * @param responseBody - The parsed JSON response from Bedrock
 * @returns Normalized LLM response with content and token counts
 */
export function parseResponse(modelFamily: ModelFamily, responseBody: unknown): LLMResponse {
  const body = responseBody as Record<string, unknown>;

  switch (modelFamily) {
    case 'anthropic':
      return parseAnthropicResponse(body);

    case 'nova':
      return parseNovaResponse(body);

    case 'meta':
      return parseMetaResponse(body);

    case 'qwen':
    case 'openai':
    case 'deepseek':
      return parseOpenAICompatibleResponse(body);

    default:
      throw new Error(`Unsupported model family for response parsing: ${modelFamily}`);
  }
}

/**
 * Parse Anthropic Claude Messages API response (snake_case)
 */
function parseAnthropicResponse(body: Record<string, unknown>): LLMResponse {
  const content = body.content as Array<{ text?: string }> | undefined;
  const usage = body.usage as { input_tokens?: number; output_tokens?: number } | undefined;

  return {
    content: content?.[0]?.text || '',
    inputTokens: usage?.input_tokens || 0,
    outputTokens: usage?.output_tokens || 0,
  };
}

/**
 * Parse Amazon Nova response (camelCase)
 */
function parseNovaResponse(body: Record<string, unknown>): LLMResponse {
  const output = body.output as { message?: { content?: Array<{ text?: string }> } } | undefined;
  const usage = body.usage as { inputTokens?: number; outputTokens?: number } | undefined;

  return {
    content: output?.message?.content?.[0]?.text || '',
    inputTokens: usage?.inputTokens || 0,
    outputTokens: usage?.outputTokens || 0,
  };
}

/**
 * Parse Meta Llama response
 */
function parseMetaResponse(body: Record<string, unknown>): LLMResponse {
  return {
    content: (body.generation as string) || '',
    inputTokens: (body.prompt_token_count as number) || 0,
    outputTokens: (body.generation_token_count as number) || 0,
  };
}

/**
 * Parse OpenAI-compatible response (Qwen, OpenAI GPT-OSS, DeepSeek)
 */
function parseOpenAICompatibleResponse(body: Record<string, unknown>): LLMResponse {
  const choices = body.choices as Array<{ message?: { content?: string } }> | undefined;
  const usage = body.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;

  return {
    content: choices?.[0]?.message?.content || '',
    inputTokens: usage?.prompt_tokens || 0,
    outputTokens: usage?.completion_tokens || 0,
  };
}
