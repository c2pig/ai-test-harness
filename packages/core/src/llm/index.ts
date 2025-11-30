/**
 * LLM Module
 *
 * Shared utilities for LLM operations across the framework.
 * Provides single source of truth for:
 * - Model family detection
 * - Request body building
 * - Response parsing
 * - Client abstraction (Bedrock, LiteLLM, Mock)
 */

// Core utilities
export * from './types';
export { getModelFamily, cleanModelId } from './model-family';
export { buildRequestBody } from './request-builder';
export { parseResponse } from './response-parser';

// Client abstraction
export {
  // Types
  type ILLMClient,
  type ChatRequest,
  type ChatResponse,
  type ChatMessage,
  type LLMProvider,
  type LLMClientConfig,
  // Factory
  LLMClientFactory,
  // Adapters
  BedrockAdapter,
  LiteLLMAdapter,
  MockAdapter,
} from './client';
