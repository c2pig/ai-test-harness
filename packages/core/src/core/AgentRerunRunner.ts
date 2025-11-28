import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ConversationJudge } from './ConversationJudge';
import { ConversationSimulator, ConversationResult } from './ConversationSimulator';
import { Logger } from '../utils/logger';
import { ArtifactWriter, BenchmarkMetadata } from '../utils/artifactWriter';
import { calculateCost } from '../utils/pricing';
import { ConnectorFactory } from '../connectors/ConnectorFactory';
import { ExpectedToolCallResult } from '../validators';
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

export class AgentRerunRunner extends BaseRunner {
  private judge?: ConversationJudge;

  constructor() {
    super();
  }

  protected getRunnerName(): string {
    return 'AgentRerunRunner';
  }

  protected getExpectedTestPlanType(): string {
    return 'agent-rerun';
  }

  protected async executeTests(
    tenantName: string,
    config: LoadedTenantConfig,
    runTimestamp: string
  ): Promise<TestRunResult> {
    const runnerName = this.getRunnerName();

    // Type narrowing for agent-rerun test plan
    if (config.testPlan.type !== 'agent-rerun') {
      throw new Error('AgentRerunRunner requires agent-rerun test plan');
    }
    const testPlan = config.testPlan;

    // Initialize judge with region from config
    this.judge = new ConversationJudge(config.evaluationPlan.region);

    const outputDir = `./outputs/${tenantName}`;
    Logger.debug(`[${runnerName}] Output: ${outputDir}/${runTimestamp}`);
    const artifactWriter = new ArtifactWriter(outputDir, runTimestamp, 'agent-rerun');

    // Validate quality attributes and build schema using BaseRunner
    const { schema, attributeNames } = await this.validateAndBuildQualitySchema(config, runnerName);

    // Initialize connector factory
    const connectorFactory = new ConnectorFactory('./config/shared/connectors.yaml');

    const agentConfig = testPlan.agentConfig;
    const conversationsConnectorName = testPlan.connectors?.conversations;
    const expectedToolCalls = testPlan.expectedToolCalls || [];

    if (!agentConfig?.agentId || !agentConfig?.agentAliasId || !agentConfig?.region) {
      throw new Error('Missing agentId, agentAliasId, or region in agent configuration');
    }

    Logger.debug(`[AgentRerunRunner] Using resolved agent model: ${agentConfig.agentId}`);

    const instructionRetriever = new AgentInstructionRetriever(agentConfig.region);
    let agentMetadata: AgentMetadata;

    try {
      agentMetadata = await instructionRetriever.retrieve(
        agentConfig.agentId,
        agentConfig.agentAliasId
      );
      Logger.debug(`[AgentRerunRunner] ✓ Agent metadata retrieved`);
      Logger.info(
        `[AgentRerunRunner]   Agent: ${agentConfig.agentId} (${agentConfig.agentAliasId})`
      );
      Logger.debug(`[AgentRerunRunner]   Foundation model: ${agentMetadata.foundationModel}`);
    } catch (error: any) {
      Logger.error(`[AgentRerunRunner] ✗ Failed to retrieve agent metadata: ${error.message}`);
      Logger.warn(
        `[AgentRerunRunner] Using fallback metadata - test will exit after writing diagnostics`
      );

      // Create fallback metadata from config
      agentMetadata = {
        agentId: agentConfig.agentId,
        agentVersion: 'UNKNOWN',
        agentAliasId: agentConfig.agentAliasId,
        instruction: '[AGENT METADATA RETRIEVAL FAILED - see error logs]',
        foundationModel: 'unknown',
        agentName: `Agent ${agentConfig.agentId}`,
        agentStatus: 'UNKNOWN',
      };

      // Write diagnostic artifact
      const diagnosticPath = path.join(outputDir, runTimestamp, '_AGENT_METADATA_ERROR.txt');
      fs.mkdirSync(path.dirname(diagnosticPath), { recursive: true });
      fs.writeFileSync(
        diagnosticPath,
        `Agent Metadata Retrieval Failed\n` +
          `=================================\n\n` +
          `Timestamp: ${new Date().toISOString()}\n` +
          `Tenant: ${tenantName}\n` +
          `Agent ID: ${agentConfig.agentId}\n` +
          `Agent Alias: ${agentConfig.agentAliasId}\n` +
          `Region: ${agentConfig.region}\n\n` +
          `Error Details:\n` +
          `${error.message}\n\n` +
          `Stack Trace:\n` +
          `${error.stack}\n\n` +
          `Common Causes:\n` +
          `- AWS credentials have expired\n` +
          `- Insufficient permissions to access Bedrock Agent\n` +
          `- Agent ID does not exist in the specified region\n` +
          `- Network connectivity issues\n`
      );

      throw new Error(`Agent metadata retrieval failed. Diagnostic file written to: ${outputDir}/${runTimestamp}/_AGENT_METADATA_ERROR.txt`);
    }

    // Create DynamoDB connector for conversations

    if (!conversationsConnectorName) {
      throw new Error('Missing connectors.conversations in config');
    }

    Logger.debug(`[AgentRerunRunner] Creating connector: ${conversationsConnectorName}`);
    const conversationsConnector = connectorFactory.create(conversationsConnectorName);

    // Fetch conversations from DynamoDB
    Logger.debug(`[AgentRerunRunner] Fetching conversations from connector...`);
    const conversations = await conversationsConnector.fetch();
    Logger.debug(`[AgentRerunRunner] ✓ Fetched ${conversations.length} conversations from DynamoDB`);

    // Get expected tool calls configuration
    if (expectedToolCalls.length > 0) {
      Logger.info(
        `[AgentRerunRunner] ✓ Tool call validation enabled with ${expectedToolCalls.length} expected tools`
      );
    }

    // Initialize conversation simulator for agent invocation
    const simulator = new ConversationSimulator(agentConfig);

    const results: any[] = [];

    Logger.debug(`[AgentRerunRunner] Will process ${conversations.length} conversations`);

    for (let i = 0; i < conversations.length; i++) {
      const dbConversation = conversations[i];

      Logger.debug(`[AgentRerunRunner] ----------------------------------------`);
      Logger.info(
        `[AgentRerunRunner] Processing conversation ${i + 1}/${conversations.length} - ${dbConversation.conversationId}`
      );
      Logger.debug(`[AgentRerunRunner] Record ID: ${dbConversation.recordId}`);
      Logger.debug(`[AgentRerunRunner] User messages: ${dbConversation.userMessages.length}`);

      try {
        // Reinvoke agent with historical user messages
        Logger.info(
          `[AgentRerunRunner] Reinvoking agent with ${dbConversation.userMessages.length} user messages...`
        );

        // Use original conversationId as sessionId for rerun tests
        const sessionId = dbConversation.conversationId;

        const conversationResult = await simulator.simulate(
          agentConfig.agentId,
          agentConfig.agentAliasId,
          dbConversation.userMessages,
          sessionId, // Use original conversation ID
          dbConversation.contextData
        );

        Logger.info(
          `[AgentRerunRunner] ✓ Conversation regenerated - ${conversationResult.turns.length} turns, ${conversationResult.totalLatencyMs}ms`
        );

        // Validate tool calls if configured
        let toolValidation: ExpectedToolCallResult | undefined;
        if (expectedToolCalls.length > 0) {
          Logger.debug(`[AgentRerunRunner] Validating tool calls...`);
          toolValidation = this.validateToolCalls(conversationResult, expectedToolCalls);

          if (!toolValidation.validationPassed) {
            Logger.warn(
              `[AgentRerunRunner] ✗ Tool validation failed for conversation ${dbConversation.conversationId}`
            );
            Logger.warn(
              `[AgentRerunRunner]   Missing: ${toolValidation.missingToolCalls.join(', ')}`
            );
            Logger.warn(
              `[AgentRerunRunner]   Unexpected: ${toolValidation.unexpectedToolCalls.join(', ')}`
            );
          } else {
            Logger.debug(`[AgentRerunRunner] ✓ Tool validation passed`);
          }
        }

        // Evaluate conversation using judge
        Logger.debug(`[AgentRerunRunner] Starting conversation evaluation...`);

        // Apply judge model defaults
        const judgeConfig = applyJudgeDefaults(config.evaluationPlan.judgeModel);

        // Use agent instruction from metadata
        const agentInstruction = agentMetadata.instruction || 'Agent instruction not available';

        const judgeResult = await this.judge.evaluateConversation(
          config.evaluationPlan.qualityAssessment.solutionDescription,
          conversationResult,
          agentInstruction,
          schema,
          config.evaluationPlan.judgeModel.modelId,
          attributeNames,
          config.evaluationPlan.qualityAssessment.calibration,
          undefined, // validations (not applicable for rerun)
          undefined, // acceptanceCriteria (not applicable for rerun)
          judgeConfig
        );

        Logger.info(
          `[AgentRerunRunner] ✓ Assessment completed for conversation ${dbConversation.conversationId}`
        );

        // Calculate costs
        const judgeModelId = judgeResult.metrics.modelId;
        const judgeCost = await calculateCost(
          judgeModelId,
          judgeResult.metrics.inputTokens,
          judgeResult.metrics.outputTokens
        );

        // Calculate agent costs from trace metrics
        const agentCost = conversationResult.traceMetrics
          ? await calculateCost(
              agentMetadata.foundationModel,
              conversationResult.traceMetrics.totalInputTokens,
              conversationResult.traceMetrics.totalOutputTokens
            )
          : 0;

        // Run validators if configured
        const validationResults = await ValidationRunner.runValidators(
          config.validatorInstances,
          { conversationId: dbConversation.conversationId }, // Use conversation as testCase
          judgeResult.assessment,
          {
            inputTokens:
              judgeResult.metrics.inputTokens +
              (conversationResult.traceMetrics?.totalInputTokens || 0),
            outputTokens:
              judgeResult.metrics.outputTokens +
              (conversationResult.traceMetrics?.totalOutputTokens || 0),
            latencyMs: judgeResult.metrics.latencyMs,
            cost: judgeCost + agentCost,
          },
          conversationResult.traceMetrics?.actionGroupInvocations?.map((inv: any) => ({
            name: inv.invocationInput?.actionGroupName || 'unknown',
            timestamp: inv.timestamp,
          }))
        );

        // Store result
        results.push({
          conversationId: dbConversation.conversationId,
          assessment: judgeResult.assessment,
          validations: validationResults,
        });

        // Write conversation artifact
        await this.writeReinvokeArtifact(
          artifactWriter,
          dbConversation,
          conversationResult,
          judgeResult,
          judgeCost,
          agentCost,
          agentMetadata,
          toolValidation
        );

        this.printAssessment(dbConversation.conversationId, judgeResult.assessment);
      } catch (error) {
        Logger.error(
          `[AgentRerunRunner] ✗ Failed to process conversation ${dbConversation.conversationId}`,
          error
        );
      }
    }

    Logger.debug(`[AgentRerunRunner] ========================================`);
    Logger.info(
      `[AgentRerunRunner] All conversations completed - Total results: ${results.length}`
    );
    Logger.debug(`[AgentRerunRunner] ========================================`);

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

      Logger.debug(`[AgentRerunRunner] Writing test summary with metadata...`);
      artifactWriter.writeTestSummary(metadata, results, runTimestamp);
    }

    this.printSummary(results);

    // Clean up AWS SDK clients to prevent hanging
    Logger.debug(`[AgentRerunRunner] Cleaning up resources...`);
    this.judge?.destroy();
    simulator.destroy();
    Logger.debug(`[AgentRerunRunner] ✓ Resources cleaned up`);

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

  /**
   * Validate tool calls from conversation
   */
  private validateToolCalls(
    conversation: ConversationResult,
    expectedToolCalls: ExpectedToolCall[]
  ): ExpectedToolCallResult {
    const actualToolCalls: string[] = [];

    // Extract tool calls from conversation turns
    for (const turn of conversation.turns) {
      if (turn.toolCalls && turn.toolCalls.length > 0) {
        for (const tc of turn.toolCalls) {
          actualToolCalls.push(tc.toolName);
        }
      }
    }

    const expectedToolCallsFound: string[] = [];
    const unexpectedToolCalls: string[] = [];
    const missingToolCalls: string[] = [];

    // Track which expected calls were found
    const expectedCallsStatus = expectedToolCalls.map(expected => ({
      ...expected,
      found: false,
    }));

    // Check each actual tool call
    for (const actualCall of actualToolCalls) {
      const matchingExpected = expectedCallsStatus.find(
        exp => exp.name === actualCall && !exp.found
      );

      if (matchingExpected) {
        matchingExpected.found = true;
        expectedToolCallsFound.push(actualCall);
      } else {
        unexpectedToolCalls.push(actualCall);
      }
    }

    // Find missing expected calls
    for (const expected of expectedCallsStatus) {
      if (!expected.found) {
        missingToolCalls.push(expected.name);
      }
    }

    const validationPassed = missingToolCalls.length === 0 && unexpectedToolCalls.length === 0;

    return {
      expectedToolCallsFound,
      unexpectedToolCalls,
      missingToolCalls,
      validationPassed,
      details: expectedCallsStatus.map(exp => ({
        toolName: exp.name,
        found: exp.found,
        triggerCondition: exp.triggerCondition,
      })),
    };
  }

  /**
   * Write rerun artifacts with same structure as agent-replay tests
   */
  private async writeReinvokeArtifact(
    artifactWriter: ArtifactWriter,
    dbConversation: any,
    conversationResult: ConversationResult,
    judgeResult: any,
    judgeCost: number,
    agentCost: number,
    agentMetadata: AgentMetadata,
    toolValidation?: ExpectedToolCallResult
  ): Promise<void> {
    // Build conversation transcript
    const transcript = this.formatConversationTranscript(
      conversationResult,
      dbConversation.contextData
    );

    // Write artifact using existing ArtifactWriter
    await artifactWriter.writeArtifact({
      recommendationId: dbConversation.conversationId,
      timestamp: new Date().toISOString(),
      inputs: {
        conversationSource: 'DynamoDB conversation_history table (historical user messages rerund)',
        originalConversationId: dbConversation.conversationId,
        recordId: dbConversation.recordId,
        createdAt: dbConversation.createdAt,
        contextData: dbConversation.contextData || {},
        userMessages: dbConversation.userMessages,
      } as any,
      taskPrompt: '', // Not applicable for rerun tests
      generatedOutput: transcript,
      rawOutput: transcript, // Immutable snapshot (guaranteed zero processing)
      judgePrompt: judgeResult.generatedPrompt,
      judgeResponse: judgeResult.rawResponse,
      assessment: judgeResult.assessment,
      scoreBreakdown: judgeResult.scoreBreakdown,
      llmStats: {
        taskLLM: {
          modelId: agentMetadata.foundationModel,
          inputTokens: conversationResult.traceMetrics?.totalInputTokens || 0,
          outputTokens: conversationResult.traceMetrics?.totalOutputTokens || 0,
          totalTokens:
            (conversationResult.traceMetrics?.totalInputTokens || 0) +
            (conversationResult.traceMetrics?.totalOutputTokens || 0),
          latencyMs: conversationResult.totalLatencyMs,
          timestamp: conversationResult.startTime,
          conversationMetrics: {
            totalTurns: conversationResult.turns.length,
            userMessages: dbConversation.userMessages.length,
            durationMs: conversationResult.totalLatencyMs,
            traceMetrics: conversationResult.traceMetrics,
          },
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
            (conversationResult.traceMetrics?.totalInputTokens || 0) +
            judgeResult.metrics.inputTokens,
          outputTokens:
            (conversationResult.traceMetrics?.totalOutputTokens || 0) +
            judgeResult.metrics.outputTokens,
          totalTokens:
            (conversationResult.traceMetrics?.totalInputTokens || 0) +
            (conversationResult.traceMetrics?.totalOutputTokens || 0) +
            judgeResult.metrics.totalTokens,
          totalLatencyMs: conversationResult.totalLatencyMs + judgeResult.metrics.latencyMs,
          estimatedCostUSD: agentCost + judgeCost,
        },
        toolValidation: toolValidation,
      },
    });

    // Write agent configuration as file 0-agent-config.yaml
    const runDir = (artifactWriter as any).runDir; // Access private field
    const conversationDir = path.join(runDir, dbConversation.conversationId);
    const agentConfigPath = path.join(conversationDir, '0-agent-config.yaml');

    // Build agent configuration object with camelCase field names
    const agentConfigObj: any = {
      agentId: agentMetadata.agentId,
      agentVersion: agentMetadata.agentVersion,
      agentAliasId: agentMetadata.agentAliasId,
      agentName: agentMetadata.agentName,
      agentStatus: agentMetadata.agentStatus,
      foundationModel: agentMetadata.foundationModel,
    };

    if (agentMetadata.inferenceConfig) {
      agentConfigObj.inferenceConfig = {
        temperature: agentMetadata.inferenceConfig.temperature,
        topP: agentMetadata.inferenceConfig.topP,
        topK: agentMetadata.inferenceConfig.topK,
        maxTokens: agentMetadata.inferenceConfig.maxTokens,
      };
    }

    if (agentMetadata.actionGroups && agentMetadata.actionGroups.length > 0) {
      agentConfigObj.actionGroups = agentMetadata.actionGroups.map(ag => {
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
      agentConfigObj.knowledgeBases = agentMetadata.knowledgeBases;
    }

    if (agentMetadata.guardrails && agentMetadata.guardrails.length > 0) {
      agentConfigObj.guardrails = agentMetadata.guardrails;
    }

    // Add instruction as the last field
    agentConfigObj.instruction = agentMetadata.instruction;

    // Write as YAML
    const yamlContent = yaml.dump(agentConfigObj, {
      indent: 2,
      lineWidth: -1, // Disable line wrapping
      noRefs: true, // Disable anchors/aliases
    });

    fs.writeFileSync(agentConfigPath, yamlContent, 'utf-8');
    Logger.debug(`[AgentRerunRunner] ✓ Wrote agent configuration to: 0-agent-config.yaml`);
  }

  /**
   * Format conversation transcript for output
   */
  private formatConversationTranscript(conversation: ConversationResult, contextData: any): string {
    const lines: string[] = [];

    lines.push(`Session: ${conversation.sessionId}`);
    lines.push(`Duration: ${conversation.totalLatencyMs}ms`);
    lines.push(`Turns: ${conversation.turns.length}`);
    lines.push('');
    lines.push('--- Conversation Transcript (REGENERATED) ---');
    lines.push('');

    let turnNumber = 0;
    for (const turn of conversation.turns) {
      if (turn.role === 'user') {
        turnNumber++;
        lines.push(`USER: ${turn.content}`);
        lines.push('');
      } else {
        // First agent turn might contain context injection
        if (turnNumber === 0 && contextData) {
          lines.push('[CONTEXT INJECTION]');
          lines.push(JSON.stringify(contextData, null, 2));
          lines.push('');
        }

        lines.push(`AGENT: ${turn.content}`);
        lines.push('');

        // Show tool calls if any
        if (turn.toolCalls && turn.toolCalls.length > 0) {
          lines.push('  Tool Calls:');
          turn.toolCalls.forEach(tc => {
            lines.push(`    - ${tc.toolName}`);
            if (tc.parameters && Object.keys(tc.parameters).length > 0) {
              lines.push(`      Parameters: ${JSON.stringify(tc.parameters, null, 6)}`);
            }
          });
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }

  protected printSummary(results: any[]): void {
    const lines: string[] = [
      `\n${'='.repeat(80)}`,
      'AGENT REINVOKE QUALITY ASSESSMENT SUMMARY',
      '='.repeat(80),
    ];

    if (results.length === 0) {
      lines.push('No conversations processed');
      Logger.info(lines.join('\n'));
      return;
    }

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
        lines.push(`${cap}: N/A (not applicable to any conversation)`);
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
    lines.push(`Total conversations: ${results.length}`);

    Logger.info(lines.join('\n'));
  }
}
