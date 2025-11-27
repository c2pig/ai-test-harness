import { Logger } from '../utils/logger';
import { LLMConfig } from '../schemas/config-schema';
import { applyGeneratorDefaults, ResolvedLLMConfig } from '../utils/llmConfigDefaults';
import { retryWithBackoff } from '../utils/retry';
import {
  ILLMClient,
  LLMClientFactory,
  ChatRequest,
} from '../llm';

export interface LLMGeneratorMetrics {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  timestamp: string;
  inferenceConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxTokens?: number;
  };
}

export interface GenerateResult {
  output: string;
  metrics: LLMGeneratorMetrics;
  compiledPrompt: string;
}

/**
 * LLM Generator for text generation tasks
 *
 * Supports dependency injection for testing:
 *   const mockClient = new MockAdapter();
 *   const generator = new LLMGenerator('ap-southeast-2', mockClient);
 *
 * Or uses LLMClientFactory for provider switching via env vars:
 *   LLM_PROVIDER=litellm LITELLM_URL=... npm run test:tenant
 */
export class LLMGenerator {
  private client: ILLMClient;

  constructor(region?: string, client?: ILLMClient) {
    const resolvedRegion = region || process.env.AWS_REGION || 'ap-southeast-2';
    // Allow injection for testing, otherwise use factory
    this.client = client || LLMClientFactory.create({ region: resolvedRegion });
    Logger.info(
      `[LLMGenerator] Initialized with ${client ? 'injected' : 'factory'} client (region: ${resolvedRegion})`
    );
  }

  async generate(
    taskPrompt: string,
    inputs: Record<string, any>,
    modelConfig: LLMConfig
  ): Promise<GenerateResult> {
    // Apply default values for optional fields
    const resolvedConfig: ResolvedLLMConfig = applyGeneratorDefaults(modelConfig);

    Logger.info(`[LLMGenerator] Preparing to generate with model: ${resolvedConfig.modelId}`);
    Logger.info(
      `[LLMGenerator] Config - temperature: ${resolvedConfig.temperature}, topP: ${resolvedConfig.topP}, maxTokens: ${resolvedConfig.maxTokens}`
    );

    const prompt = this.buildPrompt(taskPrompt, inputs);
    Logger.info(`[LLMGenerator] Prompt length: ${prompt.length} characters`);

    const modelId = resolvedConfig.modelId.replace('bedrock:', '');
    Logger.info(`[LLMGenerator] Invoking model: ${modelId}`);

    const timestamp = new Date().toISOString();

    try {
      // Build chat request
      const request: ChatRequest = {
        model: resolvedConfig.modelId,
        messages: [{ role: 'user', content: prompt }],
        temperature: resolvedConfig.temperature,
        top_p: resolvedConfig.topP,
        max_tokens: resolvedConfig.maxTokens,
      };

      Logger.info(`[LLMGenerator] Sending request via LLM client...`);

      // Use retry wrapper around client.chat
      const response = await retryWithBackoff(
        () => this.client.chat(request),
        3,
        1000,
        'LLMGenerator'
      );

      const { content, usage, latency_ms } = response;

      Logger.info(`[LLMGenerator] ✓ Generation completed`);
      Logger.info(`[LLMGenerator] Generated output length: ${content.length} characters`);
      Logger.info(
        `[LLMGenerator] Tokens: ${usage.prompt_tokens} input, ${usage.completion_tokens} output, ${usage.total_tokens} total`
      );
      Logger.info(`[LLMGenerator] Latency: ${latency_ms}ms`);

      return {
        output: content,
        metrics: {
          modelId,
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          latencyMs: latency_ms,
          timestamp,
          inferenceConfig: {
            temperature: resolvedConfig.temperature,
            topP: resolvedConfig.topP,
            maxTokens: resolvedConfig.maxTokens,
          },
        },
        compiledPrompt: prompt,
      };
    } catch (error) {
      Logger.error(`[LLMGenerator] ✗ Generation failed`, error);
      throw error;
    }
  }

  private buildPrompt(taskPrompt: string, inputs: Record<string, any>): string {
    let prompt = taskPrompt;

    Object.entries(inputs).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      if (prompt.includes(placeholder)) {
        prompt = prompt.replace(new RegExp(placeholder, 'g'), value);
      }
    });

    return prompt;
  }

  /**
   * Destroy the LLM client to clean up resources
   */
  destroy(): void {
    this.client.destroy();
    Logger.info('[LLMGenerator] ✓ Client destroyed');
  }
}
