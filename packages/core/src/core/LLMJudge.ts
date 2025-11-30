import { Logger } from '../utils/logger';
import { retryWithBackoff } from '../utils/retry';
import { generateAssessmentPrompt, CalibrationExample } from '../quality-library';
import { ILLMClient, LLMClientFactory, ChatRequest } from '../llm';

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

/**
 * LLM Judge for quality assessment
 *
 * Supports dependency injection for testing:
 *   const mockClient = new MockAdapter();
 *   const judge = new LLMJudge('us-east-1', mockClient);
 *
 * Or uses LLMClientFactory for provider switching via env vars:
 *   LLM_PROVIDER=litellm LITELLM_URL=... npm run test:tenant
 */
export class LLMJudge {
  private client: ILLMClient;

  constructor(region?: string, client?: ILLMClient) {
    // Allow injection for testing, otherwise use factory
    this.client = client || LLMClientFactory.create({ region });
    Logger.debug(`[LLMJudge] Initialized with ${client ? 'injected' : 'factory'} client`);
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
    Logger.debug(`[LLMJudge] Generating assessment prompt...`);
    Logger.debug(`[LLMJudge] Solution: ${solutionDescription}`);
    Logger.debug(`[LLMJudge] Attributes: ${attributeNames.length}`);
    Logger.debug(
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
      timestamp: string;
    },
    originalPrompt?: string
  ): Promise<EvaluateResult> {
    // Track original prompt for return value
    const promptToReturn = originalPrompt || prompt;
    const cleanedModelId = modelId.replace('bedrock:', '');
    Logger.debug(`[LLMJudge] Invoking model: ${cleanedModelId} (attempt ${attempt}/2)`);

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
        timestamp: new Date().toISOString(),
      };
    }

    Logger.debug(
      `[LLMJudge] Request config: maxTokens=${maxTokens}, temperature=${temperature}, topP=${topP}`
    );

    try {
      // Build chat request
      const request: ChatRequest = {
        model: modelId,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
      };

      Logger.debug(`[LLMJudge] Sending request via LLM client...`);

      // Use retry wrapper around client.chat
      const response = await retryWithBackoff(() => this.client.chat(request), 3, 1000, 'LLMJudge');

      Logger.info(`[LLMJudge] ✓ Received response`);

      const { content, usage, latency_ms } = response;

      // Accumulate metrics
      accumulatedMetrics.totalLatency += latency_ms;
      accumulatedMetrics.totalInput += usage.prompt_tokens;
      accumulatedMetrics.totalOutput += usage.completion_tokens;

      Logger.debug(`[LLMJudge] Response length: ${content.length} characters`);
      Logger.debug(`[LLMJudge] Parsing JSON from response...`);

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        Logger.error(`[LLMJudge] ✗ No JSON found in response`);
        Logger.error(`[LLMJudge] Response preview: ${content.substring(0, 500)}`);
        throw new Error('No JSON found in judge response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      Logger.info(`[LLMJudge] ✓ JSON parsed successfully`);

      // Pre-processing: Remove attributes with invalid scores (-1, null, undefined)
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
        Logger.debug(
          `[LLMJudge] ⚠ Removed ${removedAttributes.length} non-applicable attributes: ${removedAttributes.join(', ')}`
        );
      }

      try {
        Logger.debug(`[LLMJudge] Validating against schema...`);
        const validated = schema.parse(parsed);
        Logger.info(`[LLMJudge] ✓ Schema validation passed`);
        Logger.debug(
          `[LLMJudge] Tokens: ${accumulatedMetrics.totalInput} input, ${accumulatedMetrics.totalOutput} output`
        );
        Logger.debug(
          `[LLMJudge] Total latency: ${accumulatedMetrics.totalLatency}ms across ${attempt} attempt(s)`
        );

        return {
          assessment: validated,
          rawResponse: parsed,
          metrics: {
            modelId: cleanedModelId,
            inputTokens: accumulatedMetrics.totalInput,
            outputTokens: accumulatedMetrics.totalOutput,
            totalTokens: accumulatedMetrics.totalInput + accumulatedMetrics.totalOutput,
            latencyMs: accumulatedMetrics.totalLatency,
            timestamp: accumulatedMetrics.timestamp,
            attempts: attempt,
            validationPassed: true,
            inferenceConfig: {
              temperature,
              topP,
              maxTokens,
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
      Logger.error(`[LLMJudge] ✗ LLM invocation failed for model ${modelId}`, error);
      throw error;
    }
  }

  /**
   * Destroy the LLM client to clean up resources
   */
  destroy(): void {
    this.client.destroy();
    Logger.info('[LLMJudge] ✓ Client destroyed');
  }
}
