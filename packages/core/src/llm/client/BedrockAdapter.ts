/**
 * Bedrock Adapter
 *
 * AWS Bedrock implementation of ILLMClient.
 * Uses the shared llm/ utilities for request building and response parsing.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { ILLMClient, ChatRequest, ChatResponse, LLMClientConfig } from './types';
import { getModelFamily, cleanModelId, buildRequestBody, parseResponse } from '../index';
import { Logger } from '../../utils/logger';
import { retryWithBackoff } from '../../utils/retry';

/**
 * Bedrock-specific configuration
 */
export interface BedrockAdapterConfig {
  region?: string;
  timeout?: number;
}

/**
 * AWS Bedrock adapter implementing ILLMClient interface
 */
export class BedrockAdapter implements ILLMClient {
  private client: BedrockRuntimeClient;
  private region: string;

  constructor(config?: BedrockAdapterConfig | LLMClientConfig) {
    this.region = config?.region || process.env.AWS_REGION || 'us-east-1';
    const timeout = config?.timeout || 90000;

    this.client = new BedrockRuntimeClient({
      region: this.region,
      requestHandler: new NodeHttpHandler({
        requestTimeout: timeout,
        connectionTimeout: 5000,
        throwOnRequestTimeout: true,
      }),
    });

    Logger.info(
      `[BedrockAdapter] Initialized for region: ${this.region} (timeout: ${timeout}ms)`
    );
  }

  /**
   * Send a chat completion request to Bedrock
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();
    const modelId = cleanModelId(request.model);

    Logger.info(`[BedrockAdapter] Invoking model: ${modelId}`);

    try {
      // Get model family and build request body using shared utilities
      const modelFamily = getModelFamily(request.model);

      // Extract prompt from messages (simple case: last user message)
      const prompt = this.extractPrompt(request.messages);

      const requestBody = buildRequestBody(modelFamily, prompt, {
        temperature: request.temperature ?? 0,
        topP: request.top_p ?? 1.0,
        maxTokens: request.max_tokens ?? 4000,
      });

      const command = new InvokeModelCommand({
        modelId,
        body: JSON.stringify(requestBody),
      });

      Logger.info(`[BedrockAdapter] Sending request to Bedrock...`);
      const response = await retryWithBackoff(
        () => this.client.send(command),
        3,
        1000,
        'BedrockAdapter'
      );

      const latencyMs = Date.now() - startTime;
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      // Parse response using shared utilities
      const { content, inputTokens, outputTokens } = parseResponse(modelFamily, responseBody);

      Logger.info(`[BedrockAdapter] ✓ Response received (${latencyMs}ms)`);
      Logger.info(
        `[BedrockAdapter] Tokens: ${inputTokens} input, ${outputTokens} output`
      );

      return {
        content,
        model: modelId,
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
        },
        latency_ms: latencyMs,
      };
    } catch (error) {
      Logger.error(`[BedrockAdapter] ✗ Request failed for model ${modelId}`, error);
      throw error;
    }
  }

  /**
   * Extract prompt from chat messages
   * For now, concatenates all messages (can be enhanced for multi-turn)
   */
  private extractPrompt(messages: ChatRequest['messages']): string {
    // Simple case: return the content of the last user message
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length > 0) {
      return userMessages[userMessages.length - 1].content;
    }

    // Fallback: concatenate all messages
    return messages.map(m => m.content).join('\n\n');
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.client) {
      this.client.destroy();
      Logger.info('[BedrockAdapter] ✓ Client destroyed');
    }
  }
}

