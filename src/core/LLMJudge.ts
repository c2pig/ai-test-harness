import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Logger } from '../utils/logger';
import { retryWithBackoff } from '../utils/retry';
import { generateAssessmentPrompt, CalibrationExample } from '../quality-library';

export interface LLMJudgeMetrics {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  timestamp: string;
  attempts: number;
  validationPassed: boolean;
  inferenceConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxTokens?: number;
  };
}

export interface EvaluateResult {
  assessment: any;
  rawResponse: any;
  metrics: LLMJudgeMetrics;
  generatedPrompt: string;
  scoreBreakdown?: {
    byCategory?: Record<string, { average: number; weightedAverage: number }>;
    overall?: { average: number; weightedAverage: number };
  };
}

export class LLMJudge {
  private client: BedrockRuntimeClient;

  constructor(region?: string) {
    const resolvedRegion = region || 'us-east-1';
    this.client = new BedrockRuntimeClient({
      region: resolvedRegion,
      requestHandler: new NodeHttpHandler({
        requestTimeout: 90000, // 90 seconds
        connectionTimeout: 5000, // 5 seconds to establish connection
        throwOnRequestTimeout: true, // Convert timeout warning to error for retry
      }),
    });
    Logger.info(`[LLMJudge] Initialized Bedrock client for region: ${resolvedRegion} (timeout: 90s)`);
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
    throw new Error(`[LLMJudge] Unsupported model family: ${modelId}`);
  }

  async evaluate(
    solutionDescription: string,
    context: Record<string, any>,
    schema: any,
    modelId: string,
    attributeNames: string[],
    calibration?: { enabled: boolean; examples: CalibrationExample[] },
    inferenceConfig?: { temperature?: number; topP?: number; maxTokens?: number }
  ): Promise<EvaluateResult> {
    Logger.info(`[LLMJudge] Generating assessment prompt...`);
    Logger.info(`[LLMJudge] Solution: ${solutionDescription}`);
    Logger.info(`[LLMJudge] Attributes: ${attributeNames.length}`);
    Logger.info(
      `[LLMJudge] Calibration examples: ${calibration?.enabled ? calibration.examples.length : 0}`
    );

    // Generate prompt with compiled context (no template substitution)
    const prompt = await generateAssessmentPrompt(
      solutionDescription,
      context,
      attributeNames,
      calibration,
      modelId
    );

    Logger.info(`[LLMJudge] ✓ Prompt generated: ${prompt.length} characters`);

    try {
      return await this.invokeJudge(prompt, schema, modelId, inferenceConfig);
    } catch (error) {
      Logger.error('[LLMJudge] ✗ Judge evaluation failed', error);
      throw error;
    }
  }

  private async invokeJudge(
    prompt: string,
    schema: any,
    modelId: string,
    inferenceConfig?: { temperature?: number; topP?: number; maxTokens?: number },
    attempt: number = 1,
    accumulatedMetrics?: {
      totalLatency: number;
      totalInput: number;
      totalOutput: number;
      startTime: number;
      timestamp: string;
    },
    originalPrompt?: string
  ): Promise<EvaluateResult> {
    // Track original prompt for return value
    const promptToReturn = originalPrompt || prompt;
    const cleanModelId = modelId.replace('bedrock:', '');
    Logger.info(`[LLMJudge] Invoking model: ${cleanModelId} (attempt ${attempt}/2)`);

    // Apply conservative defaults
    const temperature = inferenceConfig?.temperature ?? 0;
    const topP = inferenceConfig?.topP ?? 1.0;
    const maxTokens = inferenceConfig?.maxTokens ?? 4000;

    // Initialize metrics on first attempt
    if (!accumulatedMetrics) {
      accumulatedMetrics = {
        totalLatency: 0,
        totalInput: 0,
        totalOutput: 0,
        startTime: Date.now(),
        timestamp: new Date().toISOString(),
      };
    }

    // Build request body based on model family
    const modelFamily = this.getModelFamily(modelId);
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
        max_tokens: maxTokens,
        temperature: temperature,
      };

      // Only include topP if it's not the default value of 1.0
      if (topP !== 1.0) {
        requestBody.top_p = topP;
      }

      Logger.info(
        `[LLMJudge] Request config: max_tokens=${maxTokens}, temperature=${temperature}, top_p=${topP}`
      );
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
          maxTokens: maxTokens,
          temperature: temperature,
        },
      };

      // Only include topP if it's not the default value of 1.0
      if (topP !== 1.0) {
        requestBody.inferenceConfig.topP = topP;
      }

      Logger.info(
        `[LLMJudge] Request config: maxTokens=${maxTokens}, temperature=${temperature}, topP=${topP}`
      );
    } else if (modelFamily === 'meta') {
      // Meta Llama format
      requestBody = {
        prompt: `<|begin_of_text|><|start_header_id|>user<|end_header_id|>\n\n${prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n`,
        max_gen_len: maxTokens,
        temperature: temperature,
      };

      if (topP !== 1.0) {
        requestBody.top_p = topP;
      }

      Logger.info(
        `[LLMJudge] Request config: max_gen_len=${maxTokens}, temperature=${temperature}, top_p=${topP}`
      );
    } else if (modelFamily === 'qwen' || modelFamily === 'openai' || modelFamily === 'deepseek') {
      // Qwen, OpenAI GPT-OSS, and DeepSeek use similar message-based format
      requestBody = {
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: maxTokens,
        temperature: temperature,
      };

      if (topP !== 1.0) {
        requestBody.top_p = topP;
      }

      Logger.info(
        `[LLMJudge] Request config: max_tokens=${maxTokens}, temperature=${temperature}, top_p=${topP}`
      );
    }

    const command = new InvokeModelCommand({
      modelId: cleanModelId,
      body: JSON.stringify(requestBody),
    });

    const attemptStartTime = Date.now();

    try {
      Logger.info(`[LLMJudge] Sending InvokeModel request to Bedrock...`);
      const response = await retryWithBackoff(
        () => this.client.send(command),
        3,
        1000,
        'LLMJudge'
      );
      const attemptLatency = Date.now() - attemptStartTime;

      Logger.info(`[LLMJudge] ✓ Received response from Bedrock`);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      // Parse response format based on model family
      let content: string;
      let inputTokens: number;
      let outputTokens: number;

      if (modelFamily === 'anthropic') {
        // Anthropic Claude Messages API format (snake_case)
        content = responseBody.content?.[0]?.text || '';
        inputTokens = responseBody.usage?.input_tokens || 0;
        outputTokens = responseBody.usage?.output_tokens || 0;
      } else if (modelFamily === 'nova') {
        // Amazon Nova format (camelCase)
        content = responseBody.output?.message?.content?.[0]?.text || '';
        inputTokens = responseBody.usage?.inputTokens || 0;
        outputTokens = responseBody.usage?.outputTokens || 0;
      } else if (modelFamily === 'meta') {
        // Meta Llama format
        content = responseBody.generation || '';
        inputTokens = responseBody.prompt_token_count || 0;
        outputTokens = responseBody.generation_token_count || 0;
      } else if (modelFamily === 'qwen' || modelFamily === 'openai' || modelFamily === 'deepseek') {
        // Qwen, OpenAI GPT-OSS, and DeepSeek format
        content = responseBody.choices?.[0]?.message?.content || '';
        inputTokens = responseBody.usage?.prompt_tokens || 0;
        outputTokens = responseBody.usage?.completion_tokens || 0;
      } else {
        throw new Error(`[LLMJudge] Unsupported model family for response parsing: ${modelFamily}`);
      }

      // Accumulate metrics
      accumulatedMetrics.totalLatency += attemptLatency;
      accumulatedMetrics.totalInput += inputTokens;
      accumulatedMetrics.totalOutput += outputTokens;

      Logger.info(`[LLMJudge] Response length: ${content.length} characters`);
      Logger.info(`[LLMJudge] Parsing JSON from response...`);

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        Logger.error(`[LLMJudge] ✗ No JSON found in response`);
        Logger.error(`[LLMJudge] Response preview: ${content.substring(0, 500)}`);
        throw new Error('No JSON found in judge response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      Logger.info(`[LLMJudge] ✓ JSON parsed successfully`);

      // Pre-processing: Remove attributes with invalid scores (-1, null, undefined)
      // This handles cases where the LLM returns -1 for "not applicable" instead of omitting the attribute
      const removedAttributes: string[] = [];
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'object' && value !== null && 'score' in value) {
          const score = (value as any).score;
          if (score === -1 || score === null || score === undefined) {
            delete parsed[key];
            removedAttributes.push(key);
          }
        }
      }
      if (removedAttributes.length > 0) {
        Logger.info(
          `[LLMJudge] ⚠ Removed ${removedAttributes.length} non-applicable attributes: ${removedAttributes.join(', ')}`
        );
      }

      try {
        Logger.info(`[LLMJudge] Validating against schema...`);
        const validated = schema.parse(parsed);
        Logger.info(`[LLMJudge] ✓ Schema validation passed`);
        Logger.info(
          `[LLMJudge] Tokens: ${accumulatedMetrics.totalInput} input, ${accumulatedMetrics.totalOutput} output`
        );
        Logger.info(
          `[LLMJudge] Total latency: ${accumulatedMetrics.totalLatency}ms across ${attempt} attempt(s)`
        );

        return {
          assessment: validated,
          rawResponse: parsed,
          metrics: {
            modelId: cleanModelId,
            inputTokens: accumulatedMetrics.totalInput,
            outputTokens: accumulatedMetrics.totalOutput,
            totalTokens: accumulatedMetrics.totalInput + accumulatedMetrics.totalOutput,
            latencyMs: accumulatedMetrics.totalLatency,
            timestamp: accumulatedMetrics.timestamp,
            attempts: attempt,
            validationPassed: true,
            inferenceConfig: {
              temperature: temperature,
              topP: topP,
              maxTokens: maxTokens,
            },
          },
          generatedPrompt: promptToReturn,
        };
      } catch (validationError) {
        if (attempt < 2) {
          Logger.warn('[LLMJudge] ⚠ Schema validation failed, retrying with correction prompt');
          const correctionPrompt = `${prompt}\n\nYour previous response had validation errors. Please return ONLY valid JSON matching the exact schema structure shown above. No explanatory text, just the JSON object.`;
          return this.invokeJudge(
            correctionPrompt,
            schema,
            modelId,
            inferenceConfig,
            attempt + 1,
            accumulatedMetrics,
            promptToReturn
          );
        }
        Logger.error('[LLMJudge] ✗ Schema validation failed after retry', validationError);
        throw validationError;
      }
    } catch (error) {
      Logger.error(`[LLMJudge] ✗ Bedrock invocation failed for model ${modelId}`, error);
      throw error;
    }
  }

  /**
   * Destroy the Bedrock client to clean up HTTP connections
   * Call this when the test runner is done to prevent hanging
   */
  destroy(): void {
    if (this.client) {
      this.client.destroy();
      Logger.info('[LLMJudge] ✓ Bedrock client destroyed');
    }
  }
}
