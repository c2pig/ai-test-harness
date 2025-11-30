/**
 * Mock Adapter
 *
 * Mock implementation of ILLMClient for unit testing.
 * Allows setting canned responses and inspecting call history.
 */

import { ILLMClient, ChatRequest, ChatResponse, LLMClientConfig } from './types';
import { Logger } from '../../utils/logger';

/**
 * Mock adapter implementing ILLMClient interface
 *
 * Features:
 * - Set canned responses per model or default
 * - Track all calls for assertions
 * - Configurable latency simulation
 */
export class MockAdapter implements ILLMClient {
  private responses: Map<string, string> = new Map();
  private callHistory: ChatRequest[] = [];
  private simulatedLatencyMs: number = 10;

  constructor(_config?: LLMClientConfig) {
    Logger.debug('[MockAdapter] Initialized for testing');
  }

  /**
   * Set a canned response for a specific model
   *
   * @param model - Model ID to match
   * @param response - Response content to return
   */
  setResponse(model: string, response: string): void {
    this.responses.set(model, response);
  }

  /**
   * Set a default response for all models
   *
   * @param response - Response content to return for any model
   */
  setDefaultResponse(response: string): void {
    this.responses.set('*', response);
  }

  /**
   * Set simulated latency for responses
   *
   * @param ms - Latency in milliseconds
   */
  setLatency(ms: number): void {
    this.simulatedLatencyMs = ms;
  }

  /**
   * Get all calls made to this adapter
   *
   * @returns Array of all ChatRequest objects received
   */
  getCalls(): ChatRequest[] {
    return [...this.callHistory];
  }

  /**
   * Get the last call made to this adapter
   *
   * @returns The most recent ChatRequest or undefined
   */
  getLastCall(): ChatRequest | undefined {
    return this.callHistory[this.callHistory.length - 1];
  }

  /**
   * Clear call history
   */
  clearCalls(): void {
    this.callHistory = [];
  }

  /**
   * Reset all state (responses and call history)
   */
  reset(): void {
    this.responses.clear();
    this.callHistory = [];
    this.simulatedLatencyMs = 10;
  }

  /**
   * Send a mock chat completion request
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    // Record the call
    this.callHistory.push({ ...request });

    // Simulate latency
    if (this.simulatedLatencyMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.simulatedLatencyMs));
    }

    // Get response (model-specific or default)
    const content =
      this.responses.get(request.model) ||
      this.responses.get('*') ||
      '{"error": "No mock response configured"}';

    // Estimate token counts (rough approximation)
    const promptText = request.messages.map(m => m.content).join(' ');
    const promptTokens = Math.ceil(promptText.length / 4);
    const completionTokens = Math.ceil(content.length / 4);

    Logger.info(`[MockAdapter] ✓ Returned mock response for model: ${request.model}`);

    return {
      content,
      model: request.model,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      latency_ms: this.simulatedLatencyMs,
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    Logger.info('[MockAdapter] ✓ Destroyed');
  }
}

