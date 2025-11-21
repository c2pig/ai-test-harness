import { ConnectorFactory } from '../connectors/ConnectorFactory';
import { CloudWatchConnector } from '../connectors/CloudWatchConnector';
import { PromptLibraryConnector } from '../connectors/PromptLibraryConnector';
import { CloudWatchConfig, PromptConfig } from '../connectors/types';
import { LLMJudge } from './LLMJudge';
import { LLMGenerator } from './LLMGenerator';
import { Logger } from '../utils/logger';
import { ArtifactWriter, LLMStats } from '../utils/artifactWriter';
import { calculateCost } from '../utils/pricing';
import { ContractValidator } from '../utils/contractValidator';
import { ValidationRunner } from '../utils/ValidationRunner';
import { applyJudgeDefaults } from '../utils/llmConfigDefaults';
import { BaseRunner } from './BaseRunner';
import { LoadedTenantConfig } from '../schemas/config-schema';

export class TestRunner extends BaseRunner {
  private connectorFactory: ConnectorFactory;
  private judge?: LLMJudge;
  private generator?: LLMGenerator;

  constructor() {
    super();
    this.connectorFactory = new ConnectorFactory();
  }

  protected getRunnerName(): string {
    return 'TestRunner';
  }

  protected getExpectedTestPlanType(): string {
    return 'text-generation';
  }

  protected async executeTests(
    tenantName: string,
    config: LoadedTenantConfig,
    runTimestamp: string
  ): Promise<void> {
    const runnerName = this.getRunnerName();

    // Type narrowing for text-generation test plan
    if (config.testPlan.type !== 'text-generation') {
      throw new Error('TestRunner requires text-generation test plan');
    }
    const testPlan = config.testPlan;

    // Normalize llmConfig to array (support single model or array of models)
    const llmConfigs = Array.isArray(testPlan.llmConfig)
      ? testPlan.llmConfig
      : [testPlan.llmConfig];

    const connectors = testPlan.connectors || {};
    const promptConfig = (testPlan as any).promptConfig;

    // Initialize LLM clients with regions from config
    this.generator = new LLMGenerator(testPlan.region);
    this.judge = new LLMJudge(config.evaluationPlan.region);

    const isMultiModel = llmConfigs.length > 1;
    if (isMultiModel) {
      Logger.info(`[TestRunner] Running multi-model comparison with ${llmConfigs.length} models:`);
      llmConfigs.forEach((cfg: any, idx: number) => {
        Logger.info(`[TestRunner]   ${idx + 1}. ${cfg.modelId}`);
      });
    } else {
      Logger.info(`[TestRunner] Generation model: ${llmConfigs[0].modelId}`);
    }
    Logger.info(`[TestRunner] Judge model: ${config.evaluationPlan.judgeModel.modelId}`);

    const outputDir = `./outputs/${tenantName}`;
    Logger.info(`[TestRunner] Output directory: ${outputDir}/${runTimestamp}`);
    const artifactWriter = new ArtifactWriter(outputDir, runTimestamp, 'text-generation');

    Logger.info(`[TestRunner] Creating connectors...`);
    if (!connectors.logs) {
      throw new Error('Logs connector is required in config.testPlan.connectors');
    }
    Logger.info(`[TestRunner] - Logs: ${connectors.logs}`);
    if (connectors.database) {
      Logger.info(`[TestRunner] - Database: ${connectors.database}`);
    }

    const logsConnector = this.connectorFactory.create(connectors.logs);
    const dbConnector = connectors.database
      ? this.connectorFactory.create(connectors.database)
      : null;

    // Prompt config is resolved by ConfigLoader and injected into config.testPlan.promptConfig
    if (!promptConfig) {
      throw new Error('Prompt configuration not found. Ensure prompt is specified in config.');
    }
    Logger.info(`[TestRunner] - Prompt: ${promptConfig.promptPath}`);
    const promptConnector = new PromptLibraryConnector(promptConfig as PromptConfig);

    Logger.info(`[TestRunner] ✓ Connectors created`);

    // Validate contracts between data connector and prompt
    const logsConfig = (logsConnector as any).config as CloudWatchConfig;
    const promptConnectorConfig = (promptConnector as any).config as PromptConfig;

    ContractValidator.validateDataContract(
      logsConfig.outputSchema,
      promptConnectorConfig.inputKeys,
      connectors.logs,
      'prompt-model' // Using generic name since prompt is now a model, not a connector
    );

    Logger.info(`[TestRunner] Fetching data in parallel...`);

    const fetchPromises = [logsConnector.fetch(), promptConnector.fetch()];

    if (dbConnector) {
      fetchPromises.push(dbConnector.fetch());
    }

    const fetchResults = await Promise.all(fetchPromises);
    let logEvents = fetchResults[0];
    const taskPrompt = fetchResults[1];
    const dbRecords = dbConnector ? fetchResults[2] : [];

    Logger.info(
      `[TestRunner] ✓ Data fetched - Logs: ${logEvents.length}${dbConnector ? `, DB records: ${dbRecords.length}` : ''}`
    );

    // Apply sampleSize limit if specified in test plan
    if (testPlan.sampleSize && testPlan.sampleSize < logEvents.length) {
      Logger.info(
        `[TestRunner] Applying sampleSize limit: ${testPlan.sampleSize} (connector provided ${logEvents.length} records)`
      );
      logEvents = logEvents.slice(0, testPlan.sampleSize);
      Logger.info(`[TestRunner] ✓ Using ${logEvents.length} test records`);
    }

    // Validate quality attributes and build schema using BaseRunner
    const { schema, attributeNames } = await this.validateAndBuildQualitySchema(config, runnerName);

    // Get maxRecords and recordKey from connector configuration
    const maxRecords = (logsConnector as CloudWatchConnector).getMaxRecords();
    // Get recordKey polymorphically - works with CloudWatch, PostgreSQL, DynamoDB
    const recordKey = (logsConnector as any).getRecordKey?.() || 'recommendationId';

    const maxTests = maxRecords ? Math.min(maxRecords, logEvents.length) : logEvents.length;
    Logger.info(
      `[TestRunner] Will process ${maxTests} tests (limited by ${maxRecords ? `maxRecords: ${maxRecords}` : 'log events'}, log events: ${logEvents.length})`
    );

    const results: any[] = [];

    // Build test identifier template from recordKey
    const testIdentifierTemplate = `\${${recordKey}}`;
    Logger.info(`[TestRunner] Using test identifier from recordKey: ${recordKey}`);

    // Get batch size from config (default to 1 for sequential processing)
    const configuredBatchSize = testPlan.batchSize || 1;

    // Adjust batch size when using multiple models to prevent overwhelming parallel execution
    const effectiveBatchSize = isMultiModel
      ? Math.max(1, Math.floor(configuredBatchSize / llmConfigs.length))
      : configuredBatchSize;

    if (isMultiModel && effectiveBatchSize !== configuredBatchSize) {
      Logger.info(
        `[TestRunner] Adjusted batch size from ${configuredBatchSize} to ${effectiveBatchSize} for ${llmConfigs.length} models`
      );
    } else {
      Logger.info(`[TestRunner] Processing with batch size: ${effectiveBatchSize}`);
    }

    // Process tests in batches
    for (let i = 0; i < maxTests; i += effectiveBatchSize) {
      const batchEnd = Math.min(i + effectiveBatchSize, maxTests);
      const batchEvents = logEvents.slice(i, batchEnd);

      Logger.info(
        `[TestRunner] Processing batch ${Math.floor(i / effectiveBatchSize) + 1} (tests ${i + 1}-${batchEnd}/${maxTests})`
      );

      // Process batch in parallel, with nested loop for multiple models
      const batchPromises = batchEvents.flatMap((event: any, batchIdx: number) =>
        llmConfigs.map((llmConfig: any, modelIdx: number) =>
          this.processTestCase(
            event,
            i + batchIdx,
            modelIdx,
            config,
            testIdentifierTemplate,
            recordKey,
            taskPrompt,
            llmConfig,
            schema,
            attributeNames,
            artifactWriter,
            dbRecords,
            maxTests,
            llmConfigs.length
          )
        )
      );

      const batchResults = await Promise.all(batchPromises);

      // Filter out null results (skipped tests) and add to results
      const validResults = batchResults.filter(r => r !== null);
      results.push(...validResults);

      // For multi-model tests, write comparison summaries after batch completes
      if (isMultiModel && validResults.length > 0) {
        // Group results by base recommendationId (without model suffix)
        const testGroups: Map<string, any[]> = new Map();
        validResults.forEach(r => {
          const baseMatchId = String(r.recommendationId).replace(
            /-(?:sonnet|nova|llama|mistral|gpt|model)-[^-]+$/,
            ''
          );
          if (!testGroups.has(baseMatchId)) {
            testGroups.set(baseMatchId, []);
          }
          testGroups.get(baseMatchId)!.push(r);
        });

        // Write comparison summary for each test that has results from all models
        for (const [baseMatchId, modelResults] of testGroups.entries()) {
          if (modelResults.length === llmConfigs.length) {
            // All models completed for this test, write comparison
            Logger.info(`[TestRunner] Writing comparison summary for ${baseMatchId}`);
            const comparisonData = modelResults.map(r => {
              const modelConfig = llmConfigs.find((cfg: any) => cfg.modelId === r.taskModel);
              if (!modelConfig) {
                Logger.warn(
                  `[TestRunner] Could not find model config for taskModel="${r.taskModel}"`
                );
                Logger.warn(
                  `[TestRunner] Available configs: ${llmConfigs.map((c: any) => c.modelId).join(', ')}`
                );
                return {
                  modelAlias: r.modelAlias || 'unknown',
                  modelConfig: {
                    modelId: r.taskModel || 'unknown',
                    temperature: undefined,
                    topP: undefined,
                    maxTokens: undefined,
                  },
                  assessment: r.assessment,
                  cost: r.cost,
                  latencyMs: r.llmStats?.taskLLM?.latencyMs || 0,
                  llmStats: r.llmStats, // Include for cost breakdown in comparison
                };
              }
              return {
                modelAlias: r.modelAlias,
                modelConfig: modelConfig,
                assessment: r.assessment,
                cost: r.cost,
                latencyMs: r.llmStats?.taskLLM?.latencyMs || 0,
                llmStats: r.llmStats, // Include for cost breakdown in comparison
              };
            });

            await artifactWriter.writeComparisonSummary(baseMatchId, comparisonData);
          }
        }
      }

      Logger.info(
        `[TestRunner] Batch completed: ${validResults.length}/${batchEvents.length * llmConfigs.length} tests successful`
      );
    }

    Logger.info(`[TestRunner] ========================================`);
    Logger.info(`[TestRunner] All tests completed - Total results: ${results.length}`);
    Logger.info(`[TestRunner] ========================================`);

    if (results.length > 0) {
      await artifactWriter.writeSummary(results, runTimestamp);
    }

    this.printSummary(results);

    // Clean up AWS SDK clients to prevent hanging
    Logger.info(`[TestRunner] Cleaning up resources...`);
    this.generator?.destroy();
    this.judge?.destroy();
    Logger.info(`[TestRunner] ✓ Resources cleaned up`);
  }

  private async processTestCase(
    event: any,
    index: number,
    modelIdx: number,
    config: any,
    testIdentifierTemplate: string,
    recordKey: string,
    taskPrompt: string,
    llmConfig: any,
    schema: any,
    attributeNames: string[],
    artifactWriter: ArtifactWriter,
    dbRecords: any[],
    maxTests: number,
    totalModels: number
  ): Promise<any | null> {
    // Phase 2: Extract data using smart extraction (outputSchema required)
    if (!event._metadata) {
      Logger.error(
        `[TestRunner] Skipping event ${index + 1} - missing _metadata. ` +
          `Connector must define 'outputSchema' to extract fields declaratively.`
      );
      return null;
    }

    // Smart extraction path - data is already clean and extracted
    const metadata = event._metadata;

    // Extract primary identifier from generic recordKey field
    const primaryId = metadata.recordKey;

    // For backward compatibility: try to extract recommendationId and jobId from metadata
    // (will be undefined if not present, which is fine)
    const recommendationId = metadata.recommendationId || metadata.match_id || primaryId;
    const jobId = metadata.jobId || metadata.job_id;

    // Remove metadata from input data (keep it separate from LLM input)
    const { _metadata, ...cleanData } = event;
    const inputData: Record<string, any> = cleanData;

    Logger.info(
      `[TestRunner] Using smart-extracted data with ${Object.keys(inputData).length} fields`
    );

    // Build test identifier from template using dynamic recordKey
    const baseTestId = this.buildTestIdentifier(testIdentifierTemplate, {
      [recordKey]: primaryId,
      recommendationId,
      jobId,
      index: index + 1,
    });

    if (!baseTestId || baseTestId.includes('unknown')) {
      Logger.warn(
        `[TestRunner] Skipping event ${index + 1} - could not build valid test identifier (result: ${baseTestId})`
      );
      return null;
    }

    // For multi-model runs, the testId is used as the directory name (no model suffix)
    // Individual model outputs go in subdirectories
    const testId = baseTestId;

    // Generate model alias for logging and artifact organization
    const modelAlias = this.generateModelAlias(llmConfig.modelId, modelIdx);

    Logger.info(`[TestRunner] ----------------------------------------`);
    if (totalModels > 1) {
      Logger.info(
        `[TestRunner] Processing test ${index + 1}/${maxTests} - Model ${modelIdx + 1}/${totalModels} (${modelAlias}) - Test ID: ${testId}`
      );
    } else {
      Logger.info(`[TestRunner] Processing test ${index + 1}/${maxTests} - Test ID: ${testId}`);
    }

    try {
      Logger.info(`[TestRunner] Generating candidate profile with ${llmConfig.modelId}...`);
      const generateResult = await this.generator.generate(taskPrompt, inputData, llmConfig);

      Logger.info(`[TestRunner] ✓ Generation completed`);

      const context = {
        taskPrompt: generateResult.compiledPrompt, // Use compiled prompt, not template
        ...inputData, // Spread all input fields dynamically
        generatedOutput: generateResult.output,
      };

      Logger.info(`[TestRunner] Starting LLM judge evaluation...`);

      // Apply judge model defaults
      const judgeConfig = applyJudgeDefaults(config.evaluationPlan.judgeModel);

      const judgeResult = await this.judge.evaluate(
        config.evaluationPlan.qualityAssessment.solutionDescription,
        context,
        schema,
        config.evaluationPlan.judgeModel.modelId,
        attributeNames,
        config.evaluationPlan.qualityAssessment.calibration,
        judgeConfig
      );

      Logger.info(`[TestRunner] ✓ Assessment completed for test ${testId}`);

      // Calculate costs
      const taskModelId = generateResult.metrics.modelId;
      const judgeModelId = judgeResult.metrics.modelId;
      const taskCost = await calculateCost(
        taskModelId,
        generateResult.metrics.inputTokens,
        generateResult.metrics.outputTokens
      );
      const judgeCost = await calculateCost(
        judgeModelId,
        judgeResult.metrics.inputTokens,
        judgeResult.metrics.outputTokens
      );

      // Construct LLM stats
      const llmStats: LLMStats = {
        taskLLM: {
          modelId: taskModelId,
          inputTokens: generateResult.metrics.inputTokens,
          outputTokens: generateResult.metrics.outputTokens,
          totalTokens: generateResult.metrics.totalTokens,
          latencyMs: generateResult.metrics.latencyMs,
          timestamp: generateResult.metrics.timestamp,
          inferenceConfig: generateResult.metrics.inferenceConfig,
        },
        judgeLLM: {
          modelId: judgeModelId,
          inputTokens: judgeResult.metrics.inputTokens,
          outputTokens: judgeResult.metrics.outputTokens,
          totalTokens: judgeResult.metrics.totalTokens,
          latencyMs: judgeResult.metrics.latencyMs,
          timestamp: judgeResult.metrics.timestamp,
          attempts: judgeResult.metrics.attempts,
          validationPassed: judgeResult.metrics.validationPassed,
          inferenceConfig: judgeResult.metrics.inferenceConfig,
        },
        total: {
          inputTokens: generateResult.metrics.inputTokens + judgeResult.metrics.inputTokens,
          outputTokens: generateResult.metrics.outputTokens + judgeResult.metrics.outputTokens,
          totalTokens: generateResult.metrics.totalTokens + judgeResult.metrics.totalTokens,
          totalLatencyMs: generateResult.metrics.latencyMs + judgeResult.metrics.latencyMs,
          estimatedCostUSD: taskCost + judgeCost,
        },
      };

      // Run validators if configured
      const validationResults = await ValidationRunner.runValidators(
        config.validatorInstances,
        { recommendationId, jobId, testId }, // Use test identifiers as testCase
        judgeResult.assessment,
        {
          inputTokens: llmStats.total.inputTokens,
          outputTokens: llmStats.total.outputTokens,
          latencyMs: llmStats.total.totalLatencyMs,
          cost: llmStats.total.estimatedCostUSD,
        }
        // No tool calls for text-generation tests
      );

      const dbRecord = dbRecords.find((r: any) => r.match_id === recommendationId?.toString());
      const result = {
        recommendationId: recommendationId || testId, // Keep recommendationId for summary, fall back to testId
        jobId: dbRecord?.job_id || jobId || 'N/A',
        assessment: judgeResult.assessment,
        validations: validationResults,
        cost: llmStats.total.estimatedCostUSD,
        taskModel: taskModelId,
        judgeModel: judgeModelId,
        taskPrompt: generateResult.compiledPrompt,
        modelAlias: totalModels > 1 ? modelAlias : undefined, // Only add for multi-model runs
        llmStats: llmStats, // Include full stats for cost breakdown in summary.json
      };

      // Write artifact (pass modelAlias for multi-model runs)
      await artifactWriter.writeArtifact(
        {
          recommendationId: testId, // Use testId as folder name
          timestamp: new Date().toISOString(),
          inputs: inputData, // Use dynamic input data
          taskPrompt: generateResult.compiledPrompt, // Save compiled prompt
          generatedOutput: generateResult.output,
          rawOutput: generateResult.output, // Immutable snapshot (guaranteed zero processing)
          judgePrompt: judgeResult.generatedPrompt,
          judgeResponse: judgeResult.rawResponse,
          assessment: judgeResult.assessment,
          llmStats,
        },
        totalModels > 1 ? modelAlias : undefined, // Pass modelAlias for multi-model runs
        totalModels > 1, // isMultiModel flag
        llmConfig // Pass model config for multi-model artifact structure
      );

      this.printAssessment(testId, judgeResult.assessment);

      return result;
    } catch (error) {
      Logger.error(`[TestRunner] ✗ Failed to process test ${testId}`, error);
      return null;
    }
  }

  private buildTestIdentifier(template: string, values: Record<string, any>): string {
    return template.replace(/\$\{(\w+)\}/g, (_, key) => {
      const value = values[key];
      if (value === undefined || value === null) {
        Logger.warn(`[TestRunner] Template variable '\${${key}}' is undefined, using 'unknown'`);
        return 'unknown';
      }
      return value.toString();
    });
  }

  /**
   * Generate a short, readable model alias from modelId
   * Examples:
   *   anthropic.claude-3-5-sonnet-20241022-v2:0 -> sonnet-3-5
   *   amazon.nova-lite-v1:0 -> nova-lite
   *   meta.llama3-70b-instruct-v1:0 -> llama3-70b
   */
  private generateModelAlias(modelId: string, modelIdx: number): string {
    // Remove provider prefix and version suffix
    const alias = modelId
      .replace(/^(bedrock:|us\.|anthropic\.|amazon\.|meta\.|mistral\.)/, '')
      .replace(/(-v\d+:\d+|-20\d{6}-v\d+:\d+|:\d+)$/, '');

    // Simplify common patterns
    if (alias.includes('claude-3-5-sonnet')) {
      return 'sonnet-3-5';
    }
    if (alias.includes('claude-sonnet-4-5')) {
      return 'sonnet-4-5';
    }
    if (alias.includes('claude-sonnet-4')) {
      return 'sonnet-4';
    }
    if (alias.includes('nova-lite')) {
      return 'nova-lite';
    }
    if (alias.includes('nova-micro')) {
      return 'nova-micro';
    }
    if (alias.includes('nova-pro')) {
      return 'nova-pro';
    }
    if (alias.includes('llama')) {
      const match = alias.match(/llama[\d.]+-(\d+b)/);
      return match ? `llama-${match[1]}` : 'llama';
    }
    if (alias.includes('mistral')) {
      return 'mistral';
    }

    // Fallback: use first 2-3 meaningful parts or add index
    const parts = alias.split(/[-.]/).filter(p => p && !p.match(/^\d+$/));
    return parts.slice(0, 2).join('-') || `model-${modelIdx + 1}`;
  }
}
