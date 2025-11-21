import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ConversationJudge } from './ConversationJudge';
import { ConversationResult } from './ConversationSimulator';
import { Logger } from '../utils/logger';
import { ArtifactWriter, BenchmarkMetadata } from '../utils/artifactWriter';
import { calculateCost } from '../utils/pricing';
import { ConnectorFactory } from '../connectors/ConnectorFactory';
import { AgentInstructionRetriever, AgentMetadata } from '../utils/AgentInstructionRetriever';
import { calculatePromptHash } from '../utils/promptHasher';
import { ValidationRunner } from '../utils/ValidationRunner';
import { applyJudgeDefaults } from '../utils/llmConfigDefaults';
import { BaseRunner } from './BaseRunner';
import { LoadedTenantConfig } from '../schemas/config-schema';

export class ConversationEvaluationRunner extends BaseRunner {
  private judge?: ConversationJudge;

  constructor() {
    super();
  }

  protected getRunnerName(): string {
    return 'ConversationEvaluationRunner';
  }

  protected getExpectedTestPlanType(): string {
    return 'conversation-evaluation';
  }

  protected async executeTests(
    tenantName: string,
    config: LoadedTenantConfig,
    runTimestamp: string
  ): Promise<void> {
    const runnerName = this.getRunnerName();

    // Type narrowing for conversation-evaluation test plan
    if (config.testPlan.type !== 'conversation-evaluation') {
      throw new Error('ConversationEvaluationRunner requires conversation-evaluation test plan');
    }
    const testPlan = config.testPlan;

    // Initialize judge with region from config
    this.judge = new ConversationJudge(config.evaluationPlan.region);

    const outputDir = `./outputs/${tenantName}`;
    Logger.info(`[${runnerName}] Output directory: ${outputDir}/${runTimestamp}`);
    const artifactWriter = new ArtifactWriter(outputDir, runTimestamp, 'conversation-evaluation');

    // Validate quality attributes and build schema using BaseRunner
    const { schema, attributeNames } = await this.validateAndBuildQualitySchema(config, runnerName);

    // Initialize connector factory
    const connectorFactory = new ConnectorFactory('./config/shared/connectors.yaml');

    const agentConfig = testPlan.agentConfig;
    const conversationsConnectorName = testPlan.connectors?.conversations;

    if (!agentConfig?.agentId || !agentConfig?.agentAliasId || !agentConfig?.region) {
      Logger.error(
        `[ConversationEvaluationRunner] ✗ Missing agentId, agentAliasId, or region in agent configuration`
      );
      process.exit(1);
    }

    Logger.info(
      `[ConversationEvaluationRunner] Using resolved agent model: ${agentConfig.agentId}`
    );

    const instructionRetriever = new AgentInstructionRetriever(agentConfig.region);
    let agentMetadata: AgentMetadata;

    try {
      agentMetadata = await instructionRetriever.retrieve(
        agentConfig.agentId,
        agentConfig.agentAliasId
      );
      Logger.info(`[ConversationEvaluationRunner] ✓ Agent metadata retrieved`);
      Logger.info(
        `[ConversationEvaluationRunner]   Foundation model: ${agentMetadata.foundationModel}`
      );
    } catch (error: any) {
      Logger.error(
        `[ConversationEvaluationRunner] ✗ Failed to retrieve agent metadata: ${error.message}`
      );
      Logger.warn(
        `[ConversationEvaluationRunner] Using fallback metadata - test will exit after writing diagnostics`
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

      Logger.info(
        `[ConversationEvaluationRunner] ✓ Wrote diagnostic file: ${outputDir}/${runTimestamp}/_AGENT_METADATA_ERROR.txt`
      );
      Logger.error(
        `[ConversationEvaluationRunner] Cannot continue - exiting after writing diagnostics`
      );
      process.exit(1);
    }

    // Create DynamoDB connector for conversations

    if (!conversationsConnectorName) {
      Logger.error('[ConversationEvaluationRunner] ✗ Missing connectors.conversations in config');
      process.exit(1);
    }

    Logger.info(`[ConversationEvaluationRunner] Creating connector: ${conversationsConnectorName}`);
    const conversationsConnector = connectorFactory.create(conversationsConnectorName);

    // Fetch conversations from DynamoDB
    Logger.info(`[ConversationEvaluationRunner] Fetching conversations from connector...`);
    const conversations = await conversationsConnector.fetch();
    Logger.info(
      `[ConversationEvaluationRunner] ✓ Fetched ${conversations.length} conversations from DynamoDB`
    );

    const results: any[] = [];

    Logger.info(
      `[ConversationEvaluationRunner] Will process ${conversations.length} replay conversations`
    );

    for (let i = 0; i < conversations.length; i++) {
      const dbConversation = conversations[i];

      Logger.info(`[ConversationEvaluationRunner] ----------------------------------------`);
      Logger.info(
        `[ConversationEvaluationRunner] Processing conversation ${i + 1}/${conversations.length} - ${dbConversation.conversationId}`
      );
      Logger.info(`[ConversationEvaluationRunner] Record ID: ${dbConversation.recordId}`);
      Logger.info(
        `[ConversationEvaluationRunner] User messages: ${dbConversation.userMessages.length}`
      );
      Logger.info(
        `[ConversationEvaluationRunner] Total turns: ${dbConversation.messageHistory.length}`
      );

      try {
        // Convert DynamoDB conversation to ConversationResult format
        const conversationResult = this.convertToConversationResult(dbConversation);

        Logger.info(
          `[ConversationEvaluationRunner] ✓ Conversation converted - ${conversationResult.turns.length} turns, ${conversationResult.totalLatencyMs}ms`
        );

        // Evaluate conversation using judge
        Logger.info(`[ConversationEvaluationRunner] Starting conversation evaluation...`);

        // Apply judge model defaults
        const judgeConfig = applyJudgeDefaults(config.evaluationPlan.judgeModel);

        // For replay tests, we don't have agent instructions - use placeholder
        const agentInstruction = 'Production agent (instructions not available in replay mode)';

        const judgeResult = await this.judge.evaluateConversation(
          config.evaluationPlan.qualityAssessment.solutionDescription,
          conversationResult,
          agentInstruction,
          schema,
          config.evaluationPlan.judgeModel.modelId,
          attributeNames,
          config.evaluationPlan.qualityAssessment.calibration,
          undefined, // validations (not applicable for replay)
          undefined, // acceptanceCriteria (not applicable for replay)
          judgeConfig
        );

        Logger.info(
          `[ConversationEvaluationRunner] ✓ Assessment completed for conversation ${dbConversation.conversationId}`
        );

        // Calculate costs
        const judgeModelId = judgeResult.metrics.modelId;
        const judgeCost = await calculateCost(
          judgeModelId,
          judgeResult.metrics.inputTokens,
          judgeResult.metrics.outputTokens
        );

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
            cost: judgeCost,
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
        this.writeReplayArtifact(
          artifactWriter,
          dbConversation,
          conversationResult,
          judgeResult,
          judgeCost,
          agentMetadata
        );

        this.printAssessment(dbConversation.conversationId, judgeResult.assessment);
      } catch (error) {
        Logger.error(
          `[ConversationEvaluationRunner] ✗ Failed to process conversation ${dbConversation.conversationId}`,
          error
        );
      }
    }

    Logger.info(`[ConversationEvaluationRunner] ========================================`);
    Logger.info(
      `[ConversationEvaluationRunner] All conversations completed - Total results: ${results.length}`
    );
    Logger.info(`[ConversationEvaluationRunner] ========================================`);

    if (results.length > 0) {
      // Build benchmark metadata for tracking test configuration
      const promptHash = calculatePromptHash(agentMetadata.instruction);

      const metadata: BenchmarkMetadata = {
        testRun: {
          tenant: tenantName,
          testType: testPlan.type,
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

      Logger.info(`[ConversationEvaluationRunner] Writing test summary with metadata...`);
      artifactWriter.writeTestSummary(metadata, results, runTimestamp);
    }

    this.printSummary(results);

    // Clean up AWS SDK clients to prevent hanging
    Logger.info(`[ConversationEvaluationRunner] Cleaning up resources...`);
    this.judge?.destroy();
    Logger.info(`[ConversationEvaluationRunner] ✓ Resources cleaned up`);
  }

  /**
   * Convert DynamoDB conversation format to ConversationResult format
   */
  private convertToConversationResult(dbConversation: any): ConversationResult {
    const turns: any[] = [];

    // Convert each message in history to a conversation turn
    for (const msg of dbConversation.messageHistory) {
      const role = msg.role === 'user' ? 'user' : 'agent';

      turns.push({
        role: role as 'user' | 'agent',
        content: msg.content,
        timestamp: msg.timestamp,
        toolCalls: msg.toolCalls || [],
      });
    }

    // Calculate approximate latency from timestamps
    let totalLatencyMs = 0;
    if (turns.length >= 2 && turns[0].timestamp && turns[turns.length - 1].timestamp) {
      const start = new Date(parseInt(turns[0].timestamp)).getTime();
      const end = new Date(parseInt(turns[turns.length - 1].timestamp)).getTime();
      totalLatencyMs = end - start;
    }

    return {
      sessionId: dbConversation.conversationId,
      turns,
      totalLatencyMs,
      startTime: turns[0]?.timestamp || new Date().toISOString(),
      endTime: turns[turns.length - 1]?.timestamp || new Date().toISOString(),
    };
  }

  /**
   * Write replay artifacts with same structure as agent-scenario tests
   */
  private async writeReplayArtifact(
    artifactWriter: ArtifactWriter,
    dbConversation: any,
    conversationResult: ConversationResult,
    judgeResult: any,
    judgeCost: number,
    agentMetadata: AgentMetadata
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
        conversationSource: 'DynamoDB conversation_history table (production replay)',
        conversationId: dbConversation.conversationId,
        recordId: dbConversation.recordId,
        createdAt: dbConversation.createdAt,
        contextData: dbConversation.contextData,
      } as any,
      taskPrompt: '', // Not applicable for replay tests
      generatedOutput: transcript,
      rawOutput: transcript, // Immutable snapshot (guaranteed zero processing)
      judgePrompt: judgeResult.generatedPrompt,
      judgeResponse: judgeResult.rawResponse,
      assessment: judgeResult.assessment,
      scoreBreakdown: judgeResult.scoreBreakdown,
      llmStats: {
        taskLLM: {
          modelId: 'production-agent',
          inputTokens: 0, // Not available in replay
          outputTokens: 0,
          totalTokens: 0,
          latencyMs: conversationResult.totalLatencyMs,
          timestamp: conversationResult.startTime,
          conversationMetrics: {
            totalTurns: conversationResult.turns.length,
            userMessages: dbConversation.userMessages.length,
            durationMs: conversationResult.totalLatencyMs,
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
          inputTokens: judgeResult.metrics.inputTokens,
          outputTokens: judgeResult.metrics.outputTokens,
          totalTokens: judgeResult.metrics.totalTokens,
          totalLatencyMs: conversationResult.totalLatencyMs + judgeResult.metrics.latencyMs,
          estimatedCostUSD: judgeCost,
        },
      },
    });

    // Write agent configuration as file 0-agent-config.yaml
    const runDir = (artifactWriter as any).runDir; // Access private field
    const conversationDir = path.join(runDir, dbConversation.conversationId);
    const agentConfigPath = path.join(conversationDir, '0-agent-config.yaml');

    // Build agent configuration object with camelCase field names
    const agentConfig: any = {
      agentId: agentMetadata.agentId,
      agentVersion: agentMetadata.agentVersion,
      agentAliasId: agentMetadata.agentAliasId,
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
    Logger.info(
      `[ConversationEvaluationRunner] ✓ Wrote agent configuration to: 0-agent-config.yaml`
    );
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
    lines.push('--- Conversation Transcript ---');
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
      'AGENT REPLAY QUALITY ASSESSMENT SUMMARY',
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
