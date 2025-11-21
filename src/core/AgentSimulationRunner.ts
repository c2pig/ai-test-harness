import { ConversationController, DynamicConversationResult } from './ConversationController';
import { UserSimulator, ScenarioContext } from './UserSimulator';
import { ConversationJudge } from './ConversationJudge';
import { Logger } from '../utils/logger';
import { ArtifactWriter, BenchmarkMetadata } from '../utils/artifactWriter';
import { calculateCost } from '../utils/pricing';
import { AgentInstructionRetriever, AgentMetadata } from '../utils/AgentInstructionRetriever';
import { calculatePromptHash } from '../utils/promptHasher';
import { ValidationRunner } from '../utils/ValidationRunner';
import { applyJudgeDefaults, applyUserSimulatorDefaults } from '../utils/llmConfigDefaults';
import { ToolCallValidationResult } from './ToolCallValidator';
import { AgentConfig, LoadedTenantConfig } from '../schemas/config-schema';
import { BaseRunner } from './BaseRunner';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * Interface for expected tool call configuration
 */
export interface ExpectedToolCall {
  name: string;
  triggerCondition: string;
  parameters?: Record<string, any>;
}

/**
 * Agent conversation runner for dynamic LLM-to-Agent conversations
 *
 * This runner orchestrates:
 * - User simulator (LLM-powered user)
 * - Bedrock Agent (conversation partner)
 * - Judge LLM (quality evaluator)
 */
export class AgentSimulationRunner extends BaseRunner {
  private judge?: ConversationJudge;

  constructor() {
    super();
  }

  protected getRunnerName(): string {
    return 'AgentSimulationRunner';
  }

  protected getExpectedTestPlanType(): string {
    return 'agent-simulation';
  }

  protected async executeTests(
    tenantName: string,
    config: LoadedTenantConfig,
    runTimestamp: string
  ): Promise<void> {
    const runnerName = this.getRunnerName();

    // Type narrowing for agent-simulation test plan
    if (config.testPlan.type !== 'agent-simulation') {
      throw new Error('AgentSimulationRunner requires agent-simulation test plan');
    }
    const testPlan = config.testPlan;

    const agentConfig = testPlan.agentConfig;
    const userSimulator = testPlan.userSimulator;
    const conversationControl = testPlan.conversationControl;
    const scenarios = testPlan.scenarios;
    const expectedToolCalls: ExpectedToolCall[] = [];

    // Validate agent-simulation specific config
    if (!agentConfig) {
      Logger.error('[AgentSimulationRunner] ✗ Missing agent configuration');
      Logger.error(
        '[AgentSimulationRunner] Please add testPlan.agentConfig or testPlan.agent to your config'
      );
      process.exit(1);
    }

    if (!userSimulator) {
      Logger.error('[AgentSimulationRunner] ✗ Missing userSimulator configuration');
      Logger.error('[AgentSimulationRunner] Please add testPlan.userSimulator to your config');
      process.exit(1);
    }

    if (!scenarios || scenarios.length === 0) {
      Logger.error('[AgentSimulationRunner] ✗ No scenarios found');
      Logger.error('[AgentSimulationRunner] Please add testPlan.scenariosPath to your config');
      process.exit(1);
    }

    // Initialize judge with region from config
    this.judge = new ConversationJudge(config.evaluationPlan.region);

    Logger.info(`[${runnerName}] Agent ID: ${agentConfig.agentId}`);
    Logger.info(`[${runnerName}] Agent Alias ID: ${agentConfig.agentAliasId}`);
    Logger.info(`[${runnerName}] Region: ${agentConfig.region}`);
    Logger.info(`[${runnerName}] User simulator model: ${userSimulator.modelId}`);
    Logger.info(`[${runnerName}] Max turns: ${conversationControl?.maxTurns || 20}`);
    Logger.info(`[${runnerName}] Scenarios: ${scenarios.length}`);
    Logger.info(`[${runnerName}] Judge model: ${config.evaluationPlan.judgeModel.modelId}`);

    const outputDir = `./outputs/${tenantName}`;
    Logger.info(`[${runnerName}] Output directory: ${outputDir}/${runTimestamp}`);
    const artifactWriter = new ArtifactWriter(outputDir, runTimestamp, 'agent-simulation');

    // Validate quality attributes and build schema using BaseRunner
    const { schema, attributeNames } = await this.validateAndBuildQualitySchema(config, runnerName);

    // Retrieve agent metadata from Bedrock API
    const instructionRetriever = new AgentInstructionRetriever(agentConfig.region);
    let agentMetadata: AgentMetadata;

    try {
      agentMetadata = await instructionRetriever.retrieve(
        agentConfig.agentId,
        agentConfig.agentAliasId
      );
      Logger.info(`[AgentSimulationRunner] ✓ Agent metadata retrieved`);
      Logger.info(
        `[AgentSimulationRunner] Agent foundation model: ${agentMetadata.foundationModel}`
      );
    } catch (error: any) {
      Logger.error(`[AgentSimulationRunner] ✗ Failed to retrieve agent metadata: ${error.message}`);
      Logger.warn(
        `[AgentSimulationRunner] Using fallback metadata - test will exit after writing diagnostics`
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
        `[AgentSimulationRunner] ✓ Wrote diagnostic file: ${outputDir}/${runTimestamp}/_AGENT_METADATA_ERROR.txt`
      );
      Logger.error(`[AgentSimulationRunner] Cannot continue - exiting after writing diagnostics`);
      process.exit(1);
    }

    // Initialize user simulator
    // Apply user simulator defaults
    const userSimulatorConfig = applyUserSimulatorDefaults(userSimulator);
    // Pass region from evaluationPlan to user simulator
    userSimulatorConfig.region = config.evaluationPlan.region;
    const userSimulatorInstance = new UserSimulator(userSimulatorConfig);

    // Initialize conversation controller
    const conversationController = new ConversationController(userSimulatorInstance, agentConfig, {
      maxTurns: conversationControl?.maxTurns || 20,
    });

    const results: any[] = [];

    // Get batch size from test plan (defaults to 1 for sequential execution)
    const batchSize = testPlan.batchSize || 1;

    Logger.info(
      `[AgentSimulationRunner] Will process ${scenarios.length} test scenarios (batch size: ${batchSize})`
    );

    // Process scenarios in batches
    for (let batchStart = 0; batchStart < scenarios.length; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, scenarios.length);
      const batch = scenarios.slice(batchStart, batchEnd);

      Logger.info(
        `[AgentSimulationRunner] Processing batch ${Math.floor(batchStart / batchSize) + 1}/${Math.ceil(scenarios.length / batchSize)} (scenarios ${batchStart + 1}-${batchEnd})`
      );

      // Process batch in parallel
      const batchPromises = batch.map((scenario, idx) =>
        this.processScenario(
          scenario,
          batchStart + idx,
          scenarios.length,
          conversationController,
          agentConfig,
          config,
          schema,
          attributeNames,
          expectedToolCalls,
          agentMetadata,
          userSimulator,
          artifactWriter
        )
      );

      // Wait for all scenarios in batch to complete
      const batchResults = await Promise.all(batchPromises);

      // Collect non-null results
      for (const result of batchResults) {
        if (result !== null) {
          results.push(result);
        }
      }
    }

    Logger.info(`[AgentSimulationRunner] ========================================`);
    Logger.info(
      `[AgentSimulationRunner] All scenarios completed - Total results: ${results.length}`
    );
    Logger.info(`[AgentSimulationRunner] ========================================`);

    if (results.length > 0) {
      // Build benchmark metadata
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
          userSimulator: {
            modelId: userSimulator.modelId,
            temperature: userSimulator.temperature,
            topP: userSimulator.topP,
            maxTokens: userSimulator.maxTokens,
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

      Logger.info(`[AgentSimulationRunner] Writing test summary with metadata...`);
      artifactWriter.writeTestSummary(metadata, results, runTimestamp);
    }

    this.printSummary(results);

    // Clean up AWS SDK clients to prevent hanging
    Logger.info(`[AgentSimulationRunner] Cleaning up resources...`);
    this.judge?.destroy();
    userSimulatorInstance.destroy();
    conversationController.destroy();
    Logger.info(`[AgentSimulationRunner] ✓ Resources cleaned up`);
  }

  /**
   * Extract tool calls from dynamic conversation for judge evaluation
   */
  private extractToolCallsFromConversation(conversationResult: DynamicConversationResult): any[] {
    const allToolCalls: any[] = [];

    for (const turn of conversationResult.turns) {
      if (turn.speaker === 'agent' && turn.agentToolCalls && turn.agentToolCalls.length > 0) {
        turn.agentToolCalls.forEach(tc => {
          allToolCalls.push({
            turn: turn.turnNumber,
            toolName: tc.toolName,
            parameters: tc.parameters,
            result: tc.result,
          });
        });
      }
    }

    return allToolCalls;
  }

  /**
   * Process a single scenario - run conversation, evaluate, and write artifacts
   */
  private async processScenario(
    scenario: ScenarioContext,
    scenarioIndex: number,
    totalScenarios: number,
    conversationController: ConversationController,
    agentConfig: AgentConfig,
    config: LoadedTenantConfig,
    schema: any,
    attributeNames: string[],
    expectedToolCalls: ExpectedToolCall[],
    agentMetadata: AgentMetadata,
    userSimulator: any,
    artifactWriter: ArtifactWriter
  ): Promise<{
    scenarioId: string;
    description: string;
    assessment: any;
    validations: any[];
  } | null> {
    Logger.info(`[AgentSimulationRunner] ----------------------------------------`);
    Logger.info(
      `[AgentSimulationRunner] Processing scenario ${scenarioIndex + 1}/${totalScenarios} - ${scenario.scenarioId}`
    );
    Logger.info(`[AgentSimulationRunner] Description: ${scenario.description}`);

    let conversationResult: DynamicConversationResult | undefined;

    try {
      // Run dynamic conversation
      Logger.info(`[AgentSimulationRunner] Starting dynamic conversation...`);

      // Extract sessionId from scenario (if specified)
      const scenarioSessionId = (scenario as any).sessionId;

      conversationResult = await conversationController.runDynamicConversation(
        agentConfig.agentId,
        agentConfig.agentAliasId,
        scenario,
        scenarioSessionId // Pass hardcoded sessionId if configured in scenario
      );

      Logger.info(`[AgentSimulationRunner] ✓ Conversation completed`);
      Logger.info(
        `[AgentSimulationRunner]   Turns: ${conversationResult.terminationDecision.turnCount}`
      );
      Logger.info(
        `[AgentSimulationRunner]   Termination: ${conversationResult.terminationDecision.reasons.join(', ')}`
      );
      Logger.info(`[AgentSimulationRunner]   Duration: ${conversationResult.totalLatencyMs}ms`);

      // Programmatic tool call validation (binary pass/fail)
      let programmaticToolValidation: ToolCallValidationResult | undefined;
      if (expectedToolCalls.length > 0) {
        // Extract actual tool names from conversation
        const actualToolNames: string[] = [];
        for (const turn of conversationResult.turns) {
          if (turn.speaker === 'agent' && turn.agentToolCalls && turn.agentToolCalls.length > 0) {
            for (const tc of turn.agentToolCalls) {
              actualToolNames.push(tc.toolName);
            }
          }
        }

        // Convert expectedToolCalls to simple string array for validation
        const expectedNames = expectedToolCalls.map((etc: ExpectedToolCall) => etc.name);

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
          }
        }

        // Build validation result
        const expectedToolCallsFound = expectedCallsStatus
          .filter((exp: { name: string; found: boolean }) => exp.found)
          .map((exp: { name: string; found: boolean }) => exp.name);
        const missingToolCalls = expectedCallsStatus
          .filter((exp: { name: string; found: boolean }) => !exp.found)
          .map((exp: { name: string; found: boolean }) => exp.name);

        // Find unexpected tool calls (not in expected list)
        const unexpectedToolCalls = actualToolNames.filter(
          (name: string) => !expectedNames.includes(name)
        );

        const validationPassed = missingToolCalls.length === 0;

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

        Logger.info(
          `[AgentSimulationRunner] Tool validation: ${validationPassed ? 'PASS' : 'FAIL'} (${expectedToolCallsFound.length}/${expectedNames.length} expected calls found)`
        );
      }

      // Evaluate conversation
      Logger.info(`[AgentSimulationRunner] Starting conversation evaluation...`);

      // Apply judge model defaults
      const judgeConfig = applyJudgeDefaults(config.evaluationPlan.judgeModel);

      // Evaluate conversation with weighted scoring
      const judgeResult = await this.judge.evaluateConversation(
        config.evaluationPlan.qualityAssessment.solutionDescription,
        conversationResult,
        agentMetadata.instruction,
        schema,
        config.evaluationPlan.judgeModel.modelId,
        attributeNames,
        config.evaluationPlan.qualityAssessment.calibration,
        (scenario as any).validations,
        scenario.acceptanceCriteria,
        judgeConfig
      );

      Logger.info(
        `[AgentSimulationRunner] ✓ Assessment completed for scenario ${scenario.scenarioId}`
      );

      // Calculate costs
      const judgeModelId = judgeResult.metrics.modelId;
      const judgeCost = await calculateCost(
        judgeModelId,
        judgeResult.metrics.inputTokens,
        judgeResult.metrics.outputTokens
      );

      // Calculate user simulator cost
      const userSimulatorModelId = userSimulator.modelId.replace('bedrock:', '');
      const userSimulatorCost = await calculateCost(
        userSimulatorModelId,
        conversationResult.userSimulatorTotalTokens,
        0 // Output tokens are included in total
      );

      // Calculate agent cost (approximate)
      const inputCostPer1k = 0.003;
      const outputCostPer1k = 0.015;
      const agentCost =
        (conversationResult.agentTotalTokens / 1000) * ((inputCostPer1k + outputCostPer1k) / 2);

      // Run validators if configured
      const validationResults = await ValidationRunner.runValidators(
        config.validatorInstances,
        scenario,
        judgeResult.assessment,
        {
          inputTokens: judgeResult.metrics.inputTokens + conversationResult.agentTotalTokens,
          outputTokens: judgeResult.metrics.outputTokens,
          latencyMs: judgeResult.metrics.latencyMs,
          cost: judgeCost + userSimulatorCost + agentCost,
        },
        conversationResult.agentTraceMetrics?.actionGroupInvocations?.map((inv: any) => ({
          name: inv.invocationInput?.actionGroupName || 'unknown',
          timestamp: inv.timestamp,
        }))
      );

      // Write conversation artifact
      await this.writeConversationArtifact(
        artifactWriter,
        scenario,
        conversationResult,
        judgeResult,
        judgeCost,
        userSimulatorCost,
        agentCost,
        agentMetadata,
        userSimulator,
        programmaticToolValidation
      );

      this.printAssessment(scenario.scenarioId, judgeResult.assessment);

      // Return result for aggregation
      return {
        scenarioId: scenario.scenarioId,
        description: scenario.description,
        assessment: judgeResult.assessment,
        validations: validationResults,
      };
    } catch (error) {
      Logger.error(
        `[AgentSimulationRunner] ✗ Failed to process scenario ${scenario.scenarioId}`,
        error
      );

      // Always write error artifact - even if we have no conversation data
      // This ensures failed scenarios are visible and debuggable
      this.writeScenarioErrorArtifact(artifactWriter, scenario, conversationResult, error);

      return null;
    }
  }

  /**
   * Write conversation artifacts
   */
  private async writeConversationArtifact(
    artifactWriter: ArtifactWriter,
    scenario: ScenarioContext,
    conversationResult: DynamicConversationResult,
    judgeResult: any,
    judgeCost: number,
    userSimulatorCost: number,
    agentCost: number,
    agentMetadata: AgentMetadata,
    userSimulatorConfig: any,
    toolValidation?: ToolCallValidationResult
  ): Promise<void> {
    const transcript = ConversationController.buildTranscript(conversationResult);

    // Write artifact
    // Filter out user simulator-specific fields from agent inputs
    // Extract only agent-relevant contextData
    const {
      persona: _persona,
      conversationExamples: _conversationExamples,
      candidateDetails,
      contextData,
      ...baseScenario
    } = scenario;

    // Build agent-relevant scenario with only the data agent should see
    const agentRelevantScenario: any = { ...baseScenario };

    // Extract agent's contextData (asymmetric information)
    if (contextData && 'agent' in contextData) {
      // New structure: use only contextData.agent
      agentRelevantScenario.contextData = contextData.agent;
    } else if (contextData) {
      // Legacy structure: use flat contextData
      agentRelevantScenario.contextData = contextData;
    } else if (candidateDetails) {
      // Legacy structure: candidateDetails at top level
      agentRelevantScenario.candidateDetails = candidateDetails;
    }

    await artifactWriter.writeArtifact({
      recommendationId: scenario.scenarioId, // Use scenarioId as recommendationId for agent-simulation tests
      testId: scenario.scenarioId,
      testDescription: scenario.description,
      agentPrompt: agentMetadata.instruction,
      inputs: {
        scenarioContext: agentRelevantScenario, // Only agent-relevant fields
      },
      generatedOutput: transcript,
      rawOutput: transcript, // Immutable snapshot (guaranteed zero processing)
      conversationMetadata: {
        turns: conversationResult.turns,
        terminationDecision: conversationResult.terminationDecision,
      },
      judgePrompt: judgeResult.generatedPrompt,
      judgeResponse: judgeResult.assessment,
      assessment: judgeResult.assessment,
      scoreBreakdown: judgeResult.scoreBreakdown, // Add weighted score breakdown
      summary: this.buildSummaryMarkdown(scenario, conversationResult, judgeResult),
      llmStats: {
        taskLLM: {
          agentId: agentMetadata.agentId,
          agentAliasId: agentMetadata.agentAliasId,
          modelId: agentMetadata.foundationModel,
          inputTokens: conversationResult.agentInputTokens,
          outputTokens: conversationResult.agentOutputTokens,
          totalTokens: conversationResult.agentTotalTokens,
          latencyMs: conversationResult.totalLatencyMs,
          timestamp: conversationResult.startTime,
          instruction: agentMetadata.instruction,
          agentTrace: this.buildEnhancedTraceData(conversationResult),
        },
        userSimulator: {
          totalTokens: conversationResult.userSimulatorTotalTokens,
          estimatedCostUSD: userSimulatorCost,
          turnCount: conversationResult.turns.filter(t => t.speaker === 'user_simulator').length,
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
          inputTokens: conversationResult.agentInputTokens + judgeResult.metrics.inputTokens,
          outputTokens: conversationResult.agentOutputTokens + judgeResult.metrics.outputTokens,
          totalTokens:
            conversationResult.userSimulatorTotalTokens +
            conversationResult.agentTotalTokens +
            judgeResult.metrics.totalTokens,
          totalLatencyMs: conversationResult.totalLatencyMs + judgeResult.metrics.latencyMs,
          estimatedCostUSD: userSimulatorCost + agentCost + judgeCost,
        },
        toolValidation: toolValidation,
      },
    });

    // Write configuration files (0-agent-config.yaml and 0-user-simulator-config.yaml)
    this.writeConfigurationFiles(
      artifactWriter,
      scenario,
      conversationResult,
      agentMetadata,
      userSimulatorConfig
    );
  }

  /**
   * Write configuration files for transparency and debugging
   */
  private writeConfigurationFiles(
    artifactWriter: ArtifactWriter,
    scenario: ScenarioContext,
    conversationResult: DynamicConversationResult,
    agentMetadata: AgentMetadata,
    userSimulatorConfig: any
  ): void {
    // Access artifactWriter's runDir (private field)
    const runDir = (artifactWriter as any).runDir;
    const scenarioDir = path.join(runDir, scenario.scenarioId);

    // 1. Write 0-agent-config.yaml
    const agentConfigPath = path.join(scenarioDir, '0-agent-config.yaml');

    const agentConfigObj: any = {
      scenarioId: scenario.scenarioId,
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

    // Write agent config as YAML
    const agentYamlContent = yaml.dump(agentConfigObj, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    });

    fs.writeFileSync(agentConfigPath, agentYamlContent, 'utf-8');
    Logger.info(`[AgentSimulationRunner] ✓ Wrote agent configuration to: 0-agent-config.yaml`);

    // 2. Write 0-user-simulator-config.yaml
    const userSimConfigPath = path.join(scenarioDir, '0-user-simulator-config.yaml');

    const userSimConfigObj: any = {
      scenarioId: scenario.scenarioId,
      model: {
        modelId: userSimulatorConfig.modelId,
        temperature: userSimulatorConfig.temperature,
        topP: userSimulatorConfig.topP,
        maxTokens: userSimulatorConfig.maxTokens,
      },
      emergentBehavior: {
        description: 'User behavior emerges from scenario context and conversation examples',
        scenarioDescription: scenario.description,
        conversationStyleExamples: scenario.conversationExamples || [],
        contextData: this.extractCandidatePersona(scenario),
      },
      promptStructure: {
        note: 'User simulator prompt is dynamically generated each turn based on conversation history',
        components: [
          'System role and instructions',
          'Scenario intent',
          'Candidate background/persona',
          'Conversation style examples (not a script)',
          'Conversation history (blackbox - no tool calls)',
          'Current agent message',
          'Response instructions with <thinking> and <response> format',
        ],
      },
      examplePromptSnippet: '(First turn prompt captured below)',
    };

    // Capture the actual prompt from the first user turn
    if (conversationResult.firstTurnPrompt) {
      userSimConfigObj.firstTurnPrompt = conversationResult.firstTurnPrompt;
    }

    // Also capture reasoning from first turn
    if (conversationResult.turns && conversationResult.turns.length > 0) {
      const firstUserTurn = conversationResult.turns.find(t => t.speaker === 'user_simulator');
      if (firstUserTurn && firstUserTurn.userSimulatorReasoning) {
        userSimConfigObj.firstTurnReasoning = firstUserTurn.userSimulatorReasoning;
      }
    }

    // Write user simulator config as YAML
    const userSimYamlContent = yaml.dump(userSimConfigObj, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    });

    fs.writeFileSync(userSimConfigPath, userSimYamlContent, 'utf-8');
    Logger.info(
      `[AgentSimulationRunner] ✓ Wrote user simulator configuration to: 0-user-simulator-config.yaml`
    );
  }

  /**
   * Write error artifact
   */
  private async writeScenarioErrorArtifact(
    artifactWriter: ArtifactWriter,
    scenario: ScenarioContext,
    conversationResult: DynamicConversationResult | undefined,
    error: any
  ): Promise<void> {
    // Build transcript only if conversation exists
    const transcript = conversationResult
      ? ConversationController.buildTranscript(conversationResult)
      : '[No conversation - error occurred before/during execution]';

    // Build trace data only if conversation exists
    const agentTrace = conversationResult
      ? this.buildEnhancedTraceData(conversationResult)
      : undefined;

    await artifactWriter.writeArtifact({
      recommendationId: scenario.scenarioId, // Use scenarioId as recommendationId for agent-simulation tests
      testId: scenario.scenarioId,
      testDescription: `${scenario.description} [ERROR]`,
      agentPrompt: '[Error occurred before agent invocation]',
      inputs: {
        scenarioContext: scenario,
      },
      generatedOutput: transcript,
      rawOutput: transcript, // Immutable snapshot (guaranteed zero processing)
      conversationMetadata: {
        turns: conversationResult?.turns || [],
        terminationDecision: conversationResult?.terminationDecision || {
          shouldTerminate: true,
          reasons: ['Error occurred before conversation completed'],
          turnCount: 0,
        },
        error: {
          message: error.message || String(error),
          stack: error.stack,
          type: error.constructor?.name || 'Error',
        },
      },
      judgePrompt: '[Judge not invoked due to error]',
      judgeResponse: { error: error.message },
      assessment: null,
      summary: `# Error\n\n${error.message}\n\n\`\`\`\n${error.stack}\n\`\`\``,
      llmStats: {
        taskLLM: {
          modelId: '[N/A - Error occurred]',
          inputTokens: conversationResult?.agentInputTokens || 0,
          outputTokens: conversationResult?.agentOutputTokens || 0,
          totalTokens: conversationResult?.agentTotalTokens || 0,
          latencyMs: conversationResult?.totalLatencyMs || 0,
          timestamp: conversationResult?.startTime || new Date().toISOString(),
          agentTrace,
        },
        userSimulator: {
          totalTokens: conversationResult?.userSimulatorTotalTokens || 0,
          estimatedCostUSD: 0,
          turnCount:
            conversationResult?.turns.filter(t => t.speaker === 'user_simulator').length || 0,
        },
        judgeLLM: {
          modelId: '[Not invoked - error occurred]',
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          latencyMs: 0,
          timestamp: new Date().toISOString(),
          attempts: 0,
          validationPassed: false,
          inferenceConfig: {
            temperature: 0,
            topP: 1.0,
            maxTokens: 0,
          },
        },
        total: {
          inputTokens: conversationResult?.agentInputTokens || 0,
          outputTokens: conversationResult?.agentOutputTokens || 0,
          totalTokens: conversationResult?.userSimulatorTotalTokens || 0,
          totalLatencyMs: conversationResult?.totalLatencyMs || 0,
          estimatedCostUSD: 0,
        },
      },
    });

    Logger.info(`[AgentSimulationRunner] ✓ Error artifact written for ${scenario.scenarioId}`);
  }

  /**
   * Build summary markdown
   */
  private buildSummaryMarkdown(
    scenario: ScenarioContext,
    conversationResult: DynamicConversationResult,
    judgeResult: any
  ): string {
    const lines: string[] = [];

    lines.push(`# Scenario: ${scenario.scenarioId}`);
    lines.push('');
    lines.push(`**Description:** ${scenario.description}`);
    lines.push('');

    lines.push('## Conversation Summary');
    lines.push('');
    lines.push(`- **Turns:** ${conversationResult.terminationDecision.turnCount}`);
    lines.push(`- **Termination:** ${conversationResult.terminationDecision.reasons.join(', ')}`);
    lines.push(`- **Duration:** ${conversationResult.totalLatencyMs}ms`);
    lines.push('');

    lines.push('## Quality Assessment');
    lines.push('');

    const assessment = judgeResult.assessment;
    Object.entries(assessment).forEach(([attr, result]: [string, any]) => {
      lines.push(`### ${attr}`);
      lines.push(`- **Score:** ${result.score}/5 (${result.grade})`);
      lines.push(`- **Explanation:** ${result.explanation}`);
      lines.push('');
    });

    return lines.join('\n');
  }

  /**
   * Extract candidate persona data for user simulator
   * Supports both new asymmetric structure (contextData.candidate) and legacy structure
   */
  private extractCandidatePersona(scenario: any): any {
    // Check for new structure: contextData.candidate
    if (scenario.contextData && 'candidate' in scenario.contextData) {
      return scenario.contextData.candidate;
    }

    // Fallback to legacy structure: candidateDetails
    if (scenario.candidateDetails) {
      return scenario.candidateDetails;
    }

    // Fallback to flat contextData (legacy)
    if (scenario.contextData) {
      return scenario.contextData;
    }

    // No candidate data
    return {};
  }

  /**
   * Build enhanced trace data with per-turn breakdown
   * This provides detailed conversation analysis for debugging and observability
   */
  private buildEnhancedTraceData(conversationResult: DynamicConversationResult): any {
    // If no agent trace metrics, return minimal structure
    if (!conversationResult.agentTraceMetrics) {
      return {
        totalSteps: 0,
        orchestrationSteps: 0,
        modelInvocations: 0,
        toolInvocations: 0,
        reasoningCaptures: 0,
        conversationTurns: [],
        toolCallDetails: [],
      };
    }

    // Build per-turn breakdown
    const conversationTurns: any[] = [];
    const toolCallDetails: any[] = [];

    // Extract agent turns from conversation
    const agentTurns = conversationResult.turns.filter(t => t.speaker === 'agent');

    agentTurns.forEach((turn, _index) => {
      // Find corresponding user message (should be previous turn)
      const userTurn = conversationResult.turns.find(
        t => t.speaker === 'user_simulator' && t.turnNumber === turn.turnNumber
      );

      conversationTurns.push({
        turnNumber: turn.turnNumber,
        userMessage: userTurn?.message?.substring(0, 100) || '',
        orchestrationSteps: 0, // Not tracked per-turn in DynamicConversationResult
        modelInvocations: 0, // Not tracked per-turn in DynamicConversationResult
        toolCalls: turn.agentToolCalls?.map(tc => tc.toolName) || [],
        reasoning: turn.agentReasoning?.[0] || null, // Take first reasoning if available
        latencyMs: turn.latencyMs || 0,
        lambdaError: turn.lambdaError, // Include Lambda error if present
      });

      // Collect tool call details
      if (turn.agentToolCalls && turn.agentToolCalls.length > 0) {
        turn.agentToolCalls.forEach(tc => {
          toolCallDetails.push({
            turnNumber: turn.turnNumber,
            toolName: tc.toolName,
            parameters: tc.parameters,
            result: typeof tc.result === 'string' ? tc.result.substring(0, 100) : tc.result,
          });
        });
      }
    });

    return {
      totalSteps: conversationResult.agentTraceMetrics.totalSteps,
      orchestrationSteps: conversationResult.agentTraceMetrics.orchestrationSteps,
      modelInvocations: conversationResult.agentTraceMetrics.modelInvocations,
      toolInvocations: conversationResult.agentTraceMetrics.toolInvocations,
      reasoningCaptures: conversationResult.agentTraceMetrics.reasoningCaptures,
      conversationTurns,
      toolCallDetails,
    };
  }
}
