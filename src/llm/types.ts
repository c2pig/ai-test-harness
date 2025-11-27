/**
 * LLM Module Types
 *
 * Shared types for all LLM operations across the framework.
 * Single source of truth for model families, request/response formats.
 */

/**
 * Supported model families for Bedrock
 */
export type ModelFamily = 'anthropic' | 'nova' | 'meta' | 'qwen' | 'openai' | 'deepseek';

/**
 * Chat message format (OpenAI-compatible)
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Inference configuration for LLM calls
 */
export interface InferenceConfig {
  temperature: number;
  topP: number;
  maxTokens: number;
}

/**
 * Parsed LLM response
 */
export interface LLMResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

