/**
 * LLM Client Factory
 *
 * Creates LLM client instances based on configuration and environment variables.
 *
 * Environment Variables:
 * - LLM_PROVIDER: 'bedrock' | 'litellm' | 'mock' (default: 'bedrock')
 * - LITELLM_URL: LiteLLM proxy URL (default: 'http://localhost:4000')
 * - LITELLM_API_KEY: LiteLLM API key
 * - AWS_REGION: AWS region for Bedrock (default: 'us-east-1')
 *
 * Usage:
 *   // Default (Bedrock)
 *   const client = LLMClientFactory.create();
 *
 *   // With config override
 *   const client = LLMClientFactory.create({ provider: 'litellm', baseUrl: '...' });
 *
 *   // For testing
 *   const mockClient = LLMClientFactory.create({ provider: 'mock' });
 */

import { ILLMClient, LLMClientConfig, LLMProvider } from './types';
import { BedrockAdapter } from './BedrockAdapter';
import { LiteLLMAdapter } from './LiteLLMAdapter';
import { MockAdapter } from './MockAdapter';
import { Logger } from '../../utils/logger';

/**
 * Factory for creating LLM client instances
 */
export class LLMClientFactory {
  /**
   * Create an LLM client based on configuration and environment variables
   *
   * Priority:
   * 1. Config parameter (if provided)
   * 2. Environment variables
   * 3. Defaults (Bedrock, us-east-1)
   *
   * @param config - Optional client configuration
   * @returns ILLMClient instance
   */
  static create(config?: Partial<LLMClientConfig>): ILLMClient {
    const provider = this.resolveProvider(config?.provider);

    const fullConfig: LLMClientConfig = {
      provider,
      region: config?.region || process.env.AWS_REGION || 'us-east-1',
      baseUrl: config?.baseUrl || process.env.LITELLM_URL || 'http://localhost:4000',
      apiKey: config?.apiKey || process.env.LITELLM_API_KEY,
      timeout: config?.timeout || 90000,
    };

    Logger.info(`[LLMClientFactory] Creating client: provider=${provider}`);

    switch (provider) {
      case 'bedrock':
        return new BedrockAdapter(fullConfig);

      case 'litellm':
        if (!fullConfig.baseUrl) {
          throw new Error(
            '[LLMClientFactory] LiteLLM requires baseUrl. ' +
              'Set LITELLM_URL environment variable or pass baseUrl in config.'
          );
        }
        return new LiteLLMAdapter(fullConfig);

      case 'mock':
        return new MockAdapter(fullConfig);

      default:
        throw new Error(`[LLMClientFactory] Unknown provider: ${provider}`);
    }
  }

  /**
   * Resolve provider from config or environment
   */
  private static resolveProvider(configProvider?: LLMProvider): LLMProvider {
    // Config takes precedence
    if (configProvider) {
      return configProvider;
    }

    // Check environment variable
    const envProvider = process.env.LLM_PROVIDER?.toLowerCase();
    if (envProvider) {
      if (envProvider === 'bedrock' || envProvider === 'litellm' || envProvider === 'mock') {
        return envProvider;
      }
      Logger.warn(
        `[LLMClientFactory] Invalid LLM_PROVIDER="${envProvider}", using default "bedrock"`
      );
    }

    // Default to Bedrock
    return 'bedrock';
  }

  /**
   * Get current provider from environment
   * Useful for logging/diagnostics
   */
  static getCurrentProvider(): LLMProvider {
    return this.resolveProvider();
  }

  /**
   * Check if LiteLLM is configured
   */
  static isLiteLLMConfigured(): boolean {
    return !!(process.env.LLM_PROVIDER === 'litellm' && process.env.LITELLM_URL);
  }
}

