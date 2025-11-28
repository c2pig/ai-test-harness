import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ConversationSimulator, ConversationResult } from './ConversationSimulator';
import { ConversationJudge } from './ConversationJudge';
import { Logger } from '../utils/logger';
import { ArtifactWriter, BenchmarkMetadata } from '../utils/artifactWriter';
import { calculateCost } from '../utils/pricing';
import {
  ConversationToolValidator,
  ExpectedToolCallResult,
} from '../validators';
import { AgentInstructionRetriever, AgentMetadata } from '../utils/AgentInstructionRetriever';
import { calculatePromptHash } from '../utils/promptHasher';
import { ValidationRunner } from '../utils/ValidationRunner';
import { applyJudgeDefaults } from '../utils/llmConfigDefaults';
import { BaseRunner, TestRunResult } from './BaseRunner';
import { LoadedTenantConfig } from '../schemas/config-schema';

export interface ExpectedToolCall {
  name: string;
  triggerCondition: string;
  parameters?: Record<string, any>;
}

export interface TestScenario {
  scenarioId: string;
  description: string;
  conversationExamples: Array<{ user: string }>;
  persona?: string[];
  contextData?: Record<string, any>;
  validations?: {
    toolCalls?: string[];
    escalation?: boolean;
    escalationType?: string;
  };
  acceptanceCriteria?: string[];
}

export class AgentTestRunner extends BaseRunner {
  private judge?: ConversationJudge;

  constructor() {
    super();
  }

  protected getRunnerName(): string {
    return 'AgentTestRunner';
  }

  protected getExpectedTestPlanType(): string {
    return 'agent-scenario';
  }

  protected async executeTests(
    tenantName: string,
    config: LoadedTenantConfig,
    runTimestamp: string
  ): Promise<TestRunResult> {
    const runnerName = this.getRunnerName();

    // Type narrowing for agent-scenario test plan
    if (config.testPlan.type !== 'agent-scenario') {
      throw new Error('AgentTestRunner requires agent-scenario test plan');
    }
    const testPlan = config.testPlan;

    const previewAgentConfig = testPlan.agentConfig;
    const previewScenarios = testPlan.scenarios;

    // Initialize judge with region from config
    this.judge = new ConversationJudge(config.evaluationPlan.region);

    if (previewAgentConfig) {
      Logger.debug(`[${runnerName}] Agent ID: ${previewAgentConfig.agentId}`);
      Logger.debug(`[${runnerName}] Agent Alias ID: ${previewAgentConfig.agentAliasId}`);
      Logger.debug(`[${runnerName}] Region: ${previewAgentConfig.region}`);
    }
    if (previewScenarios) {
      Logger.debug(`[${runnerName}] Scenarios: ${previewScenarios.length}`);
    }
    Logger.debug(`[${runnerName}] Judge model: ${config.evaluationPlan.judgeModel.modelId}`);

    const outputDir = `./outputs/${tenantName}`;
    Logger.debug(`[${runnerName}] Output directory: ${outputDir}/${runTimestamp}`);
    const artifactWriter = new ArtifactWriter(outputDir, runTimestamp, 'agent-conversation');

    // Validate quality attributes and build schema using BaseRunner
    const { schema, attributeNames } = await this.validateAndBuildQualitySchema(config, runnerName);

    const agentConfig = testPlan.agentConfig;
    const scenarios = testPlan.scenarios;
    const expectedToolCalls: any[] = [];

    if (!agentConfig) {
      throw new Error('Agent configuration not found. Please ensure testPlan.agent is configured in config.yaml');
    }

    if (!scenarios || scenarios.length === 0) {
      throw new Error('No scenarios found. Please ensure scenarios are configured in config.yaml');
    }

    // Retrieve agent metadata from Bedrock API
    const instructionRetriever = new AgentInstructionRetriever(agentConfig.region);
    const agentMetadata = await instructionRetriever.retrieve(agentConfig.agentId);
    Logger.debug(`[AgentTestRunner] Agent metadata: ${agentMetadata.foundationModel}`);

    // Initialize conversation simulator
    const simulator = new ConversationSimulator(agentConfig);

    const results: any[] = [];

    Logger.info(`[AgentTestRunner] Processing ${scenarios.length} scenarios`);

    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];

      Logger.debug(`[AgentTestRunner] Scenario ${i + 1}/${scenarios.length}: ${scenario.scenarioId}`);
      Logger.debug(`[AgentTestRunner] Description: ${scenario.description}`);

      // Declare conversation outside try block so it's accessible in catch
      let conversation: ConversationResult | undefined;

      try {
        // Extract user messages from conversation examples
        const userMessages = scenario.conversationExamples.map(
          (turn: { user: string }) => turn.user
        );

        // Log context data if provided
        const contextData = scenario.contextData;
        if (contextData) {
          Logger.debug(`[AgentTestRunner] Context data: ${Object.keys(contextData).join(', ')}`);
        }

        // Extract sessionId from scenario (if specified)
        const scenarioSessionId = (scenario as any).sessionId;

        // Warn if hardcoded sessionId is used
        if (scenarioSessionId) {
          Logger.warn(
            `[AgentTestRunner] Using hardcoded sessionId: "${scenarioSessionId}" - Bedrock may maintain session state across runs`
          );
        }

        conversation = await simulator.simulate(
          agentConfig.agentId,
          agentConfig.agentAliasId,
          userMessages,
          scenarioSessionId, // Pass hardcoded sessionId if configured in scenario
          contextData
        );

        Logger.debug(`[AgentTestRunner] Conversation: ${conversation.turns.length} turns, ${conversation.totalLatencyMs}ms`);

        // Validate tool calls (programmatic validation from config.expectedToolCalls)
        let programmaticToolValidation: ExpectedToolCallResult | undefined;
        if (expectedToolCalls.length > 0) {
          Logger.debug(`[AgentTestRunner] Validating ${expectedToolCalls.length} expected tool calls`);

          // Extract actual tool names from conversation
          const actualToolNames: string[] = [];
          for (const turn of conversation.turns) {
            if (turn.toolCalls && turn.toolCalls.length > 0) {
              for (const tc of turn.toolCalls) {
                actualToolNames.push(tc.toolName);
              }
            }
          }

          // Convert expectedToolCalls to simple string array for validation
          const expectedNames = expectedToolCalls.map((etc: ExpectedToolCall) => etc.name);

          // Find expected calls that were found
          const expectedToolCallsFound: string[] = [];
          const unexpectedToolCalls: string[] = [];
          const missingToolCalls: string[] = [];

          // Track which expected calls were found
          const expectedCallsStatus = expectedNames.map((name: string) => ({
            name,
            found: false,
          }));

          // Check each actual tool call
          for (const actualCall of actualToolNames) {
            const matchingExpected = expectedCallsStatus.find(
              (exp: { name: string; found: boolean }) => exp.name === actualCall && !exp.found
            );

            if (matchingExpected) {
              matchingExpected.found = true;
              expectedToolCallsFound.push(actualCall);
            } else {
              if (!unexpectedToolCalls.includes(actualCall)) {
                unexpectedToolCalls.push(actualCall);
              }
            }
          }

          // Find missing expected calls
          for (const expected of expectedCallsStatus) {
            if (!expected.found) {
              missingToolCalls.push(expected.name);
            }
          }

          const validationPassed =
            missingToolCalls.length === 0 && unexpectedToolCalls.length === 0;

          programmaticToolValidation = {
            expectedToolCallsFound,
            unexpectedToolCalls,
            missingToolCalls,
            validationPassed,
            details: expectedCallsStatus.map((exp: { name: string; found: boolean }) => ({
              toolName: exp.name,
              found: exp.found,
              triggerCondition:
                expectedToolCalls.find((etc: ExpectedToolCall) => etc.name === exp.name)
                  ?.triggerCondition || 'always',
            })),
          };

          if (!programmaticToolValidation.validationPassed) {
            Logger.warn(`[AgentTestRunner] Tool validation failed: missing=${missingToolCalls.join(',')}, unexpected=${unexpectedToolCalls.join(',')}`);
          }
        }

        // Validate tool calls (scenario-level validation for judge)
        Logger.debug(`[AgentTestRunner] Validating scenario tool calls...`);
        const toolValidation = ConversationToolValidator.validate(
          conversation.turns,
          scenario.validations?.toolCalls
        );

        if (!toolValidation.passed) {
          Logger.warn(`[AgentTestRunner] Tool validation failed: ${toolValidation.errors.join('; ')}`);
        } else if (toolValidation.warnings.length > 0) {
          Logger.debug(`[AgentTestRunner] Tool warnings: ${toolValidation.warnings.join('; ')}`);
        }

        // Apply judge model defaults
        const judgeConfig = applyJudgeDefaults(config.evaluationPlan.judgeModel);

        const judgeResult = await this.judge.evaluateConversation(
          config.evaluationPlan.qualityAssessment.solutionDescription,
          conversation,
          agentMetadata.instruction,
          schema,
          config.evaluationPlan.judgeModel.modelId,
          attributeNames,
          config.evaluationPlan.qualityAssessment.calibration,
          scenario.validations,
          scenario.acceptanceCriteria,
          judgeConfig
        );

        Logger.debug(`[AgentTestRunner] Assessment completed: ${scenario.scenarioId}`);

        // Calculate costs
        const judgeModelId = judgeResult.metrics.modelId;
        const judgeCost = await calculateCost(
          judgeModelId,
          judgeResult.metrics.inputTokens,
          judgeResult.metrics.outputTokens
        );

        // Calculate agent cost
        let agentCost = 0;
        if (conversation.traceMetrics) {
          const inputCostPer1k = 0.003;
          const outputCostPer1k = 0.015;
          agentCost =
            (conversation.traceMetrics.totalInputTokens / 1000) * inputCostPer1k +
            (conversation.traceMetrics.totalOutputTokens / 1000) * outputCostPer1k;
        }

        // Run validators if configured
        const validationResults = await ValidationRunner.runValidators(
          config.validatorInstances,
          scenario,
          judgeResult.assessment,
          {
            inputTokens:
              judgeResult.metrics.inputTokens + (conversation.traceMetrics?.totalInputTokens || 0),
            outputTokens:
              judgeResult.metrics.outputTokens +
              (conversation.traceMetrics?.totalOutputTokens || 0),
            latencyMs: judgeResult.metrics.latencyMs,
            cost: judgeCost + agentCost,
          },
          conversation.traceMetrics?.actionGroupInvocations?.map((inv: any) => ({
            name: inv.invocationInput?.actionGroupName || 'unknown',
            timestamp: inv.timestamp,
          }))
        );

        // Store result
        results.push({
          scenarioId: scenario.scenarioId,
          description: scenario.description,
          assessment: judgeResult.assessment,
          validations: validationResults,
        });

        // Write conversation artifact
        await this.writeConversationArtifact(
          artifactWriter,
          scenario,
          conversation,
          judgeResult,
          judgeCost,
          agentCost,
          agentMetadata,
          programmaticToolValidation
        );

        this.printAssessment(scenario.scenarioId, judgeResult.assessment);
      } catch (error) {
        Logger.error(
          `[AgentTestRunner] ✗ Failed to process scenario ${scenario.scenarioId}`,
          error
        );

        // Always write error artifact - even if we have no conversation data
        // This ensures failed scenarios are visible and debuggable
        this.writeScenarioErrorArtifact(artifactWriter, scenario, conversation, error);
      }
    }

    Logger.info(`[AgentTestRunner] Completed ${results.length} scenarios`);

    if (results.length > 0) {
      // Build benchmark metadata for tracking test configuration
      const promptHash = calculatePromptHash(agentMetadata.instruction);

      const metadata: BenchmarkMetadata = {
        testRun: {
          tenant: tenantName,
          testType: config.testPlan.type,
          timestamp: runTimestamp,
          environment: process.env.ENVIRONMENT || 'unknown',
        },
        model: {
          agent: {
            agentId: agentConfig.agentId,
            agentAlias: agentConfig.agentAliasId,
            foundationModel: agentMetadata.foundationModel,
          },
          judge: {
            modelId: config.evaluationPlan.judgeModel.modelId,
            temperature: config.evaluationPlan.judgeModel.temperature,
            topP: config.evaluationPlan.judgeModel.topP,
            maxTokens: config.evaluationPlan.judgeModel.maxTokens,
          },
        },
        prompt: {
          promptPath: `Agent instruction (${agentConfig.agentId})`,
          contentHash: promptHash,
        },
        evaluation: {
          qualityAttributes: attributeNames,
          calibrationEnabled: !!config.evaluationPlan.qualityAssessment.calibration,
          judgeConfig: {
            modelId: config.evaluationPlan.judgeModel.modelId,
            temperature: config.evaluationPlan.judgeModel.temperature,
            topP: config.evaluationPlan.judgeModel.topP,
            maxTokens: config.evaluationPlan.judgeModel.maxTokens,
          },
        },
      };

      artifactWriter.writeTestSummary(metadata, results, runTimestamp);
    }

    this.printSummary(results);

    // Clean up AWS SDK clients to prevent hanging
    this.judge?.destroy();
    simulator.destroy();

    // Calculate pass/fail counts and average score
    const passed = results.filter(r => r.assessment && !r.error).length;
    const failed = results.length - passed;

    // Calculate average score from assessments
    let totalScore = 0;
    let scoreCount = 0;
    for (const result of results) {
      if (result.assessment) {
        const scores = Object.values(result.assessment).map((a: any) => a.score).filter((s: any) => typeof s === 'number');
        totalScore += scores.reduce((sum: number, s: number) => sum + s, 0);
        scoreCount += scores.length;
      }
    }
    const avgScore = scoreCount > 0 ? totalScore / scoreCount : undefined;

    return {
      totalTests: results.length,
      passed,
      failed,
      avgScore,
      results,
    };
  }

  private async writeConversationArtifact(
    artifactWriter: ArtifactWriter,
    scenario: TestScenario,
    conversation: ConversationResult,
    judgeResult: any,
    judgeCost: number,
    agentCost: number,
    agentMetadata: AgentMetadata,
    toolValidation?: ExpectedToolCallResult
  ): Promise<void> {
    // Build conversation transcript using the centralized formatter
    const transcript = ConversationSimulator.formatTranscript(conversation);

    // Write artifact using existing ArtifactWriter
    // Note: This uses the same structure as single-turn tests for consistency
    await artifactWriter.writeArtifact({
      recommendationId: scenario.scenarioId,
      timestamp: new Date().toISOString(),
      inputs: {
        scenarioDescription: scenario.description,
        conversationExamples: JSON.stringify(scenario.conversationExamples, null, 2),
        validations: JSON.stringify(scenario.validations || {}, null, 2),
        acceptanceCriteria: JSON.stringify(scenario.acceptanceCriteria || [], null, 2),
      } as any, // Cast to satisfy type
      taskPrompt: '', // Not applicable for agent tests
      generatedOutput: transcript,
      rawOutput: transcript, // Immutable snapshot (guaranteed zero processing)
      judgePrompt: judgeResult.generatedPrompt,
      judgeResponse: judgeResult.rawResponse,
      assessment: judgeResult.assessment,
      scoreBreakdown: judgeResult.scoreBreakdown,
      llmStats: {
        taskLLM: {
          modelId: agentMetadata.foundationModel,
          inputTokens: conversation.traceMetrics?.totalInputTokens || 0,
          outputTokens: conversation.traceMetrics?.totalOutputTokens || 0,
          totalTokens:
            (conversation.traceMetrics?.totalInputTokens || 0) +
            (conversation.traceMetrics?.totalOutputTokens || 0),
          latencyMs: conversation.totalLatencyMs,
          timestamp: conversation.startTime,
          inferenceConfig: agentMetadata.inferenceConfig,
          agentTrace: this.buildEnhancedTraceData(conversation),
        },
        judgeLLM: {
          modelId: judgeResult.metrics.modelId,
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
          inputTokens:
            (conversation.traceMetrics?.totalInputTokens || 0) + judgeResult.metrics.inputTokens,
          outputTokens:
            (conversation.traceMetrics?.totalOutputTokens || 0) + judgeResult.metrics.outputTokens,
          totalTokens:
            (conversation.traceMetrics?.totalInputTokens || 0) +
            (conversation.traceMetrics?.totalOutputTokens || 0) +
            judgeResult.metrics.totalTokens,
          totalLatencyMs: conversation.totalLatencyMs + judgeResult.metrics.latencyMs,
          estimatedCostUSD: agentCost + judgeCost,
        },
        toolValidation: toolValidation,
      },
    });

    // Write agent configuration as file 0-agent-config.yaml
    const runDir = (artifactWriter as any).runDir; // Access private field
    const scenarioDir = path.join(runDir, scenario.scenarioId);
    const agentConfigPath = path.join(scenarioDir, '0-agent-config.yaml');

    // Build agent configuration object with camelCase field names
    const agentConfig: any = {
      agentName: agentMetadata.agentName,
      agentStatus: agentMetadata.agentStatus,
      foundationModel: agentMetadata.foundationModel,
    };

    if (agentMetadata.inferenceConfig) {
      agentConfig.inferenceConfig = {
        temperature: agentMetadata.inferenceConfig.temperature,
        topP: agentMetadata.inferenceConfig.topP,
        topK: agentMetadata.inferenceConfig.topK,
        maxTokens: agentMetadata.inferenceConfig.maxTokens,
      };
    }

    if (agentMetadata.actionGroups && agentMetadata.actionGroups.length > 0) {
      agentConfig.actionGroups = agentMetadata.actionGroups.map(ag => {
        const group: any = {
          actionGroupName: ag.actionGroupName,
          actionGroupState: ag.actionGroupState,
        };
        if (ag.description) {
          group.description = ag.description;
        }
        if (ag.functions && ag.functions.length > 0) {
          group.functions = ag.functions;
        }
        return group;
      });
    }

    if (agentMetadata.knowledgeBases && agentMetadata.knowledgeBases.length > 0) {
      agentConfig.knowledgeBases = agentMetadata.knowledgeBases;
    }

    if (agentMetadata.guardrails && agentMetadata.guardrails.length > 0) {
      agentConfig.guardrails = agentMetadata.guardrails;
    }

    // Add instruction as the last field
    agentConfig.instruction = agentMetadata.instruction;

    // Write as YAML
    const yamlContent = yaml.dump(agentConfig, {
      indent: 2,
      lineWidth: -1, // Disable line wrapping
      noRefs: true, // Disable anchors/aliases
    });

    fs.writeFileSync(agentConfigPath, yamlContent, 'utf-8');
    Logger.debug(`[AgentTestRunner] Wrote agent config: 0-agent-config.yaml`);
  }

  private writeScenarioErrorArtifact(
    artifactWriter: ArtifactWriter,
    scenario: TestScenario,
    conversation: ConversationResult | undefined,
    error: any
  ): void {
    const artifacts: Record<string, string> = {};

    // 1. Error summary
    const errorSummary = {
      scenarioId: scenario.scenarioId,
      description: scenario.description,
      error: {
        message: error.message || String(error),
        type: error.constructor?.name || 'Error',
        stack: error.stack,
      },
      partialDataCaptured: {
        hasConversation: !!conversation,
        conversationTurns: conversation?.turns.length || 0,
        hasPartialTrace: !!(error as any).partialTrace,
      },
    };

    artifacts['0-error-summary.json'] = JSON.stringify(errorSummary, null, 2);

    // 2. Partial conversation transcript (if available)
    if (conversation && conversation.turns.length > 0) {
      artifacts['1-partial-conversation.txt'] =
        ConversationSimulator.formatTranscript(conversation);
    }

    // 3. Partial trace data (if attached to error)
    if ((error as any).partialTrace) {
      artifacts['2-partial-trace.json'] = JSON.stringify((error as any).partialTrace, null, 2);
    }

    // 4. Raw traces for debugging
    if (
      (error as any).partialTrace?.rawTraces &&
      (error as any).partialTrace.rawTraces.length > 0
    ) {
      artifacts['3-raw-traces.json'] = JSON.stringify(
        (error as any).partialTrace.rawTraces,
        null,
        2
      );
    }

    // Write artifacts using ArtifactWriter's method
    const runDir = (artifactWriter as any).runDir;
    const scenarioDir = path.join(runDir, scenario.scenarioId);

    // Create scenario directory if it doesn't exist
    if (!fs.existsSync(scenarioDir)) {
      fs.mkdirSync(scenarioDir, { recursive: true });
    }

    // Write each artifact file
    for (const [filename, content] of Object.entries(artifacts)) {
      const filepath = path.join(scenarioDir, filename);
      fs.writeFileSync(filepath, content, 'utf-8');
    }

    Logger.debug(`[AgentTestRunner] Error artifact written: ${scenario.scenarioId}`);
  }

  private buildEnhancedTraceData(conversation: ConversationResult): any {
    if (!conversation.traceMetrics) {
      return undefined;
    }

    // Build per-turn breakdown
    const conversationTurns: any[] = [];
    const toolCallDetails: any[] = [];

    let turnNumber = 0;
    for (const turn of conversation.turns) {
      if (turn.role === 'user') {
        turnNumber++;
        continue; // Skip user turns for trace details
      }

      // Extract trace data from agent turn
      const traceData = turn.traceData as any;

      conversationTurns.push({
        turnNumber,
        userMessage:
          turnNumber > 0
            ? conversation.turns[conversationTurns.length * 2]?.content?.substring(0, 100)
            : '',
        orchestrationSteps: traceData?.orchestrationSteps || 0,
        modelInvocations: traceData?.modelInvocations || 0,
        toolCalls: turn.toolCalls?.map(tc => tc.toolName) || [],
        reasoning: traceData?.reasoning?.[0] || null,
        latencyMs: 0, // Per-turn latency not tracked separately
      });

      // Collect tool call details
      if (turn.toolCalls && turn.toolCalls.length > 0) {
        turn.toolCalls.forEach(tc => {
          toolCallDetails.push({
            turnNumber,
            toolName: tc.toolName,
            parameters: tc.parameters,
            result: typeof tc.result === 'string' ? tc.result.substring(0, 100) : tc.result,
          });
        });
      }
    }

    return {
      totalSteps: conversation.traceMetrics.totalSteps,
      orchestrationSteps: conversation.traceMetrics.orchestrationSteps,
      modelInvocations: conversation.traceMetrics.modelInvocations,
      toolInvocations: conversation.traceMetrics.toolInvocations,
      reasoningCaptures: conversation.traceMetrics.reasoningCaptures,
      conversationTurns,
      toolCallDetails,
    };
  }

  protected printSummary(results: any[]): void {
    const lines: string[] = [
      `\n${'='.repeat(80)}`,
      'AGENT QUALITY ASSESSMENT SUMMARY',
      '='.repeat(80),
    ];

    // Collect all unique capabilities (some may be omitted in certain tests)
    const allCapabilities = new Set<string>();
    results.forEach(result => {
      Object.keys(result.assessment || {}).forEach(cap => allCapabilities.add(cap));
    });

    const aggregated: Record<
      string,
      { total: number; count: number; passed: number; omitted: number }
    > = {};

    allCapabilities.forEach(cap => {
      aggregated[cap] = { total: 0, count: 0, passed: 0, omitted: 0 };
    });

    results.forEach(result => {
      allCapabilities.forEach(cap => {
        const data = result.assessment[cap];
        if (data && data.score !== undefined) {
          // Attribute was evaluated
          aggregated[cap].total += data.score;
          aggregated[cap].count++;
          if (data.score >= 4) aggregated[cap].passed++;
        } else {
          // Attribute was omitted (not applicable)
          aggregated[cap].omitted++;
        }
      });
    });

    Object.entries(aggregated).forEach(([cap, stats]) => {
      if (stats.count === 0) {
        // Omitted in all scenarios
        lines.push(`${cap}: N/A (not applicable to any scenario)`);
      } else {
        const avgScore = (stats.total / stats.count).toFixed(1);
        const passRate = ((stats.passed / stats.count) * 100).toFixed(1);
        const evaluatedTests = stats.count;
        const omittedTests = stats.omitted;
        lines.push(
          `${cap}: Avg ${avgScore}/5, Pass Rate ${passRate}% (${evaluatedTests} evaluated, ${omittedTests} omitted)`
        );
      }
    });

    lines.push('='.repeat(80));
    lines.push(`Total scenarios: ${results.length}`);

    Logger.info(lines.join('\n'));
  }
}
