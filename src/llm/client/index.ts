/**
 * LLM Client Module
 *
 * Provides a unified interface for LLM operations with swappable backends.
 *
 * Supported providers:
 * - bedrock: AWS Bedrock (default)
 * - litellm: LiteLLM proxy server
 * - mock: Mock for testing
 *
 * Usage:
 *   import { LLMClientFactory, ILLMClient } from '../llm/client';
 *
 *   const client = LLMClientFactory.create();
 *   const response = await client.chat({
 *     model: 'anthropic.claude-3-5-sonnet',
 *     messages: [{ role: 'user', content: 'Hello' }],
 *   });
 */

// Types
export type {
  ILLMClient,
  ChatRequest,
  ChatResponse,
  ChatMessage,
  LLMProvider,
  LLMClientConfig,
} from './types';

// Factory
export { LLMClientFactory } from './ClientFactory';

// Adapters (for direct instantiation if needed)
export { BedrockAdapter, type BedrockAdapterConfig } from './BedrockAdapter';
export { LiteLLMAdapter, type LiteLLMAdapterConfig } from './LiteLLMAdapter';
export { MockAdapter } from './MockAdapter';

