/**
 * LLM Client Types
 *
 * Defines the interface for LLM clients, enabling:
 * - Swappable implementations (Bedrock, LiteLLM, Mock)
 * - Easy testing with mock clients
 * - Future-proof LiteLLM migration
 */

/**
 * Chat message in OpenAI-compatible format
 * Used by LiteLLM and as common format for all adapters
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Chat completion request
 * Uses OpenAI-compatible format for LiteLLM compatibility
 */
export interface ChatRequest {
  /** Model ID (e.g., "anthropic.claude-3-5-sonnet", "deepseek.v3-v1:0") */
  model: string;

  /** Conversation messages */
  messages: ChatMessage[];

  /** Temperature (0-1), defaults to 0 */
  temperature?: number;

  /** Top-p sampling (0-1), defaults to 1.0 */
  top_p?: number;

  /** Maximum output tokens */
  max_tokens?: number;
}

/**
 * Chat completion response
 * Normalized format across all adapters
 */
export interface ChatResponse {
  /** Generated text content */
  content: string;

  /** Model that generated the response */
  model: string;

  /** Token usage statistics */
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };

  /** Request latency in milliseconds */
  latency_ms: number;
}

/**
 * LLM Client Interface
 *
 * All LLM adapters must implement this interface.
 * Uses OpenAI-compatible format for seamless LiteLLM migration.
 */
export interface ILLMClient {
  /**
   * Send a chat completion request
   *
   * @param request - Chat request with model, messages, and config
   * @returns Chat response with content, usage, and latency
   */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /**
   * Clean up resources (close connections, destroy SDK clients)
   * Call this when done to prevent hanging connections
   */
  destroy(): void;
}

/**
 * LLM Provider type
 */
export type LLMProvider = 'bedrock' | 'litellm' | 'mock';

/**
 * Client configuration
 */
export interface LLMClientConfig {
  /** Provider type */
  provider?: LLMProvider;

  /** AWS region for Bedrock */
  region?: string;

  /** LiteLLM base URL */
  baseUrl?: string;

  /** LiteLLM API key */
  apiKey?: string;

  /** Request timeout in milliseconds */
  timeout?: number;
}

