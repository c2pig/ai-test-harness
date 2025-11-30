/**
 * LiteLLM Adapter
 *
 * LiteLLM proxy implementation of ILLMClient.
 * Uses OpenAI-compatible HTTP API format.
 *
 * LiteLLM proxy exposes: POST /chat/completions
 * with OpenAI-compatible request/response format.
 */

import { ILLMClient, ChatRequest, ChatResponse, LLMClientConfig } from './types';
import { Logger } from '../../utils/logger';

/**
 * LiteLLM OpenAI-compatible response structure
 */
interface LiteLLMResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * LiteLLM-specific configuration
 */
export interface LiteLLMAdapterConfig {
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
}

/**
 * LiteLLM adapter implementing ILLMClient interface
 *
 * Calls LiteLLM proxy server using OpenAI-compatible API.
 * No request transformation needed - LiteLLM handles model routing.
 */
export class LiteLLMAdapter implements ILLMClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;

  constructor(config?: LiteLLMAdapterConfig | LLMClientConfig) {
    this.baseUrl = config?.baseUrl || process.env.LITELLM_URL || 'http://localhost:4000';
    this.apiKey = config?.apiKey || process.env.LITELLM_API_KEY || 'sk-1234';
    this.timeout = config?.timeout || 90000;

    Logger.debug(`[LiteLLMAdapter] Initialized for endpoint: ${this.baseUrl}`);
  }

  /**
   * Send a chat completion request to LiteLLM proxy
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();

    Logger.debug(`[LiteLLMAdapter] Invoking model: ${request.model}`);

    try {
      // LiteLLM uses OpenAI format natively - direct pass-through
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature ?? 0,
          top_p: request.top_p ?? 1.0,
          max_tokens: request.max_tokens ?? 4000,
        }),
        signal: AbortSignal.timeout(this.timeout),
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LiteLLM error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as LiteLLMResponse;

      Logger.info(`[LiteLLMAdapter] ✓ Response received (${latencyMs}ms)`);
      Logger.debug(
        `[LiteLLMAdapter] Tokens: ${data.usage?.prompt_tokens || 0} input, ${data.usage?.completion_tokens || 0} output`
      );

      return {
        content: data.choices?.[0]?.message?.content || '',
        model: data.model || request.model,
        usage: {
          prompt_tokens: data.usage?.prompt_tokens || 0,
          completion_tokens: data.usage?.completion_tokens || 0,
          total_tokens: data.usage?.total_tokens || 0,
        },
        latency_ms: latencyMs,
      };
    } catch (error) {
      Logger.error(`[LiteLLMAdapter] ✗ Request failed for model ${request.model}`, error);
      throw error;
    }
  }

  /**
   * Clean up resources
   * HTTP client doesn't need cleanup
   */
  destroy(): void {
    Logger.info('[LiteLLMAdapter] ✓ Destroyed (no cleanup needed)');
  }
}

