import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Logger } from '../utils/logger';
import { LLMConfig } from '../schemas/config-schema';
import { applyGeneratorDefaults, ResolvedLLMConfig } from '../utils/llmConfigDefaults';
import { retryWithBackoff } from '../utils/retry';

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

export class LLMGenerator {
  private client: BedrockRuntimeClient;

  constructor(region?: string) {
    const resolvedRegion = region || process.env.AWS_REGION || 'ap-southeast-2';
    this.client = new BedrockRuntimeClient({
      region: resolvedRegion,
      requestHandler: new NodeHttpHandler({
        requestTimeout: 90000, // 90 seconds
        connectionTimeout: 5000, // 5 seconds to establish connection
        throwOnRequestTimeout: true, // Convert timeout warning to error for retry
      }),
    });
    Logger.info(`[LLMGenerator] Initialized Bedrock client for region: ${resolvedRegion} (timeout: 90s)`);
  }

  private getModelFamily(
    modelId: string
  ): 'anthropic' | 'nova' | 'meta' | 'qwen' | 'openai' | 'deepseek' {
    // Remove bedrock: prefix and cross-region prefixes (us., eu., apac., au., etc.)
    const cleanId = modelId
      .replace('bedrock:', '')
      .replace(/^(us|eu|apac|au)\./i, '')
      .toLowerCase();

    if (cleanId.includes('anthropic') || cleanId.includes('claude')) {
      return 'anthropic';
    }
    if (cleanId.includes('amazon.nova') || cleanId.includes('nova')) {
      return 'nova';
    }
    if (cleanId.includes('meta.llama')) {
      return 'meta';
    }
    if (cleanId.includes('qwen.')) {
      return 'qwen';
    }
    if (cleanId.includes('openai.')) {
      return 'openai';
    }
    if (cleanId.includes('deepseek.')) {
      return 'deepseek';
    }
    throw new Error(`[LLMGenerator] Unsupported model family: ${modelId}`);
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

    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    try {
      // Build request body based on model family
      const modelFamily = this.getModelFamily(resolvedConfig.modelId);
      let requestBody: any;

      if (modelFamily === 'anthropic') {
        // Anthropic Claude Messages API format (snake_case)
        requestBody = {
          anthropic_version: 'bedrock-2023-05-31',
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: resolvedConfig.maxTokens,
          temperature: resolvedConfig.temperature,
        };

        // Only include topP if it's not the default value of 1.0
        if (resolvedConfig.topP !== 1.0) {
          requestBody.top_p = resolvedConfig.topP;
        }
      } else if (modelFamily === 'nova') {
        // Amazon Nova format (camelCase in inferenceConfig)
        requestBody = {
          schemaVersion: 'messages-v1',
          messages: [
            {
              role: 'user',
              content: [{ text: prompt }],
            },
          ],
          inferenceConfig: {
            maxTokens: resolvedConfig.maxTokens,
            temperature: resolvedConfig.temperature,
          },
        };

        // Only include topP if it's not the default value of 1.0
        if (resolvedConfig.topP !== 1.0) {
          requestBody.inferenceConfig.topP = resolvedConfig.topP;
        }
      } else if (modelFamily === 'meta') {
        // Meta Llama format
        requestBody = {
          prompt: `<|begin_of_text|><|start_header_id|>user<|end_header_id|>\n\n${prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n`,
          max_gen_len: resolvedConfig.maxTokens,
          temperature: resolvedConfig.temperature,
        };

        if (resolvedConfig.topP !== 1.0) {
          requestBody.top_p = resolvedConfig.topP;
        }
      } else if (modelFamily === 'qwen' || modelFamily === 'openai' || modelFamily === 'deepseek') {
        // Qwen, OpenAI GPT-OSS, and DeepSeek use similar message-based format
        requestBody = {
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: resolvedConfig.maxTokens,
          temperature: resolvedConfig.temperature,
        };

        if (resolvedConfig.topP !== 1.0) {
          requestBody.top_p = resolvedConfig.topP;
        }
      }

      const command = new InvokeModelCommand({
        modelId,
        body: JSON.stringify(requestBody),
      });

      Logger.info(`[LLMGenerator] Sending request to Bedrock...`);
      const response = await retryWithBackoff(
        () => this.client.send(command),
        3,
        1000,
        'LLMGenerator'
      );
      const latencyMs = Date.now() - startTime;

      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      // Parse response format based on model family
      let generatedText: string;
      let inputTokens: number;
      let outputTokens: number;

      if (modelFamily === 'anthropic') {
        // Anthropic Claude Messages API format (snake_case)
        generatedText = responseBody.content?.[0]?.text || '';
        inputTokens = responseBody.usage?.input_tokens || 0;
        outputTokens = responseBody.usage?.output_tokens || 0;
      } else if (modelFamily === 'nova') {
        // Amazon Nova format (camelCase)
        generatedText = responseBody.output?.message?.content?.[0]?.text || '';
        inputTokens = responseBody.usage?.inputTokens || 0;
        outputTokens = responseBody.usage?.outputTokens || 0;
      } else if (modelFamily === 'meta') {
        // Meta Llama format
        generatedText = responseBody.generation || '';
        inputTokens = responseBody.prompt_token_count || 0;
        outputTokens = responseBody.generation_token_count || 0;
      } else if (modelFamily === 'qwen' || modelFamily === 'openai' || modelFamily === 'deepseek') {
        // Qwen, OpenAI GPT-OSS, and DeepSeek format
        generatedText = responseBody.choices?.[0]?.message?.content || '';
        inputTokens = responseBody.usage?.prompt_tokens || 0;
        outputTokens = responseBody.usage?.completion_tokens || 0;
      } else {
        throw new Error(
          `[LLMGenerator] Unsupported model family for response parsing: ${modelFamily}`
        );
      }

      const totalTokens = inputTokens + outputTokens;

      Logger.info(`[LLMGenerator] ✓ Generation completed`);
      Logger.info(`[LLMGenerator] Generated output length: ${generatedText.length} characters`);
      Logger.info(
        `[LLMGenerator] Tokens: ${inputTokens} input, ${outputTokens} output, ${totalTokens} total`
      );
      Logger.info(`[LLMGenerator] Latency: ${latencyMs}ms`);

      return {
        output: generatedText,
        metrics: {
          modelId,
          inputTokens,
          outputTokens,
          totalTokens,
          latencyMs,
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
   * Destroy the Bedrock client to clean up HTTP connections
   * Call this when the test runner is done to prevent hanging
   */
  destroy(): void {
    if (this.client) {
      this.client.destroy();
      Logger.info('[LLMGenerator] ✓ Bedrock client destroyed');
    }
  }
}
