import { UserSimulator, ScenarioContext, ConversationMessage, UserResponse } from './UserSimulator';
import {
  ConversationSimulator,
  ToolCall,
  AgentConfig,
  AgentTraceMetrics,
} from './ConversationSimulator';
import { Logger } from '../utils/logger';

export interface ConversationTurnDetail {
  turnNumber: number;
  speaker: 'user_simulator' | 'agent';
  message: string;
  timestamp: string;
  userSimulatorSignaledEnd?: boolean;
  userSimulatorReasoning?: string;
  agentToolCalls?: ToolCall[];
  agentReasoning?: string[];
  latencyMs?: number;
  lambdaError?: {
    message: string;
    stack?: string;
    errorType: string;
  };
}

export interface TerminationDecision {
  shouldTerminate: boolean;
  reasons: string[];
  turnCount: number;
}

export interface DynamicConversationResult {
  sessionId: string;
  scenario: ScenarioContext;
  turns: ConversationTurnDetail[];
  terminationDecision: TerminationDecision;
  totalLatencyMs: number;
  startTime: string;
  endTime: string;
  userSimulatorTotalTokens: number;
  agentTotalTokens: number;
  agentInputTokens: number;
  agentOutputTokens: number;
  agentTraceMetrics?: AgentTraceMetrics;
  firstTurnPrompt?: string; // The actual prompt sent to user simulator on first turn
}

export interface ConversationControlConfig {
  maxTurns: number;
}

/**
 * Conversation controller for agent-conversation tests
 *
 * Responsibilities:
 * - Manage turn alternation between user simulator and agent
 * - Enforce blackbox testing (user sees only messages, not tool calls)
 * - Check 4 independent termination conditions
 * - Build detailed conversation transcript
 * - Track metrics for both user simulator and agent
 */
export class ConversationController {
  private userSimulator: UserSimulator;
  private agentSimulator: ConversationSimulator;
  private controlConfig: ConversationControlConfig;

  // Static counter for guaranteed unique session IDs in parallel execution
  private static sessionCounter = 0;

  constructor(
    userSimulator: UserSimulator,
    agentConfig: AgentConfig,
    controlConfig: ConversationControlConfig
  ) {
    this.userSimulator = userSimulator;
    this.agentSimulator = new ConversationSimulator(agentConfig);
    this.controlConfig = controlConfig;

    Logger.debug(`[ConversationController] Initialized with maxTurns: ${controlConfig.maxTurns}`);
  }

  /**
   * Run a dynamic conversation between user simulator and agent
   *
   * Conversation loop:
   * 1. User simulator generates message
   * 2. Agent responds (via ConversationSimulator)
   * 3. Check termination conditions
   * 4. Repeat until termination
   *
   * Termination conditions (any can trigger):
   * - agent_escalation: Agent calls tool containing "escalate"
   * - completion_tool_called: Agent calls tool containing "complete" or "finish"
   * - user_simulator_ends: User LLM includes <END_CONVERSATION> tag
   * - max_turns_reached: Turn count exceeds maxTurns
   */
  async runDynamicConversation(
    agentId: string,
    agentAliasId: string,
    scenario: ScenarioContext,
    overrideSessionId?: string
  ): Promise<DynamicConversationResult> {
    const startTime = new Date().toISOString();

    // Use override sessionId if provided, otherwise generate unique ID using counter + timestamp + random
    const sessionId =
      overrideSessionId ||
      `conv-${++ConversationController.sessionCounter}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Warn if hardcoded sessionId is used
    if (overrideSessionId) {
      Logger.warn(
        `[ConversationController] Using hardcoded sessionId: "${sessionId}" - Bedrock may maintain session state across runs`
      );
    }

    Logger.debug(
      `[ConversationController] Starting dynamic conversation for scenario: ${scenario.scenarioId}`
    );
    Logger.debug(`[ConversationController] Session ID: ${sessionId}`);
    Logger.debug(`[ConversationController] Max turns: ${this.controlConfig.maxTurns}`);

    const turns: ConversationTurnDetail[] = [];
    let totalLatencyMs = 0;
    let userSimulatorTotalTokens = 0;
    let agentTotalTokens = 0;
    let agentInputTokens = 0;
    let agentOutputTokens = 0;
    let firstTurnPrompt: string | undefined; // Capture prompt from first turn
    let terminationDecision: TerminationDecision = {
      shouldTerminate: false,
      reasons: [],
      turnCount: 0,
    };

    // Initialize aggregated trace metrics
    const aggregatedTraceMetrics: AgentTraceMetrics = {
      totalSteps: 0,
      orchestrationSteps: 0,
      modelInvocations: 0,
      toolInvocations: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      reasoningCaptures: 0,
    };

    // Prepare context data for agent (if provided)
    // Note: jobDetails and companyDetails are intentionally excluded from user simulator (asymmetric info)
    const agentContextData = this.buildAgentContextData(scenario);

    let turnCount = 0;
    while (turnCount < this.controlConfig.maxTurns) {
      turnCount++;
      Logger.debug(`[ConversationController] === Turn ${turnCount} ===`);

      // PHASE 1: User simulator generates message
      const userTurnStart = Date.now();

      // Build conversation history for user (BLACKBOX - only messages, no tool calls)
      const userConversationHistory = this.buildUserConversationHistory(turns);

      // For first turn, use initial agent greeting or start with user message
      let agentLastMessage = '';
      if (turns.length > 0) {
        // Get most recent agent message
        const lastAgentTurn = turns
          .slice()
          .reverse()
          .find(t => t.speaker === 'agent');
        agentLastMessage = lastAgentTurn?.message || '';
      }

      let userResponse: UserResponse;
      try {
        userResponse = await this.userSimulator.generateResponse(
          userConversationHistory,
          agentLastMessage,
          scenario
        );
      } catch (error) {
        Logger.error('[ConversationController] User simulator failed', error);
        throw error;
      }

      const userTurnLatency = Date.now() - userTurnStart;
      totalLatencyMs += userTurnLatency;
      userSimulatorTotalTokens += userResponse.metrics.totalTokens;

      // Capture prompt from first turn (for documentation purposes)
      if (turnCount === 1 && userResponse.prompt) {
        firstTurnPrompt = userResponse.prompt;
      }

      // Record user turn
      turns.push({
        turnNumber: turnCount,
        speaker: 'user_simulator',
        message: userResponse.message,
        timestamp: new Date().toISOString(),
        userSimulatorSignaledEnd: userResponse.shouldEnd,
        userSimulatorReasoning: userResponse.reasoning,
        latencyMs: userTurnLatency,
      });

      Logger.debug(
        `[ConversationController] Turn ${turnCount} - User: ${userResponse.message.substring(0, 50)}...`
      );
      Logger.debug(`[ConversationController] User signaled end: ${userResponse.shouldEnd}`);

      // PHASE 2: Agent responds to user message
      const agentTurnStart = Date.now();

      // Invoke agent with user message
      const agentConversationResult = await this.agentSimulator.simulate(
        agentId,
        agentAliasId,
        [userResponse.message],
        sessionId,
        turnCount === 1 ? agentContextData : undefined // Inject context only on first turn
      );

      const agentTurnLatency = Date.now() - agentTurnStart;
      totalLatencyMs += agentTurnLatency;

      // Extract agent's actual response (last turn in agent conversation result)
      const agentTurn = agentConversationResult.turns[agentConversationResult.turns.length - 1];
      const agentMessage = agentTurn.content;
      const agentToolCalls = agentTurn.toolCalls || [];
      const agentReasoning = agentTurn.traceData?.reasoning || [];

      // Aggregate agent tokens and trace metrics
      if (agentConversationResult.traceMetrics) {
        const metrics = agentConversationResult.traceMetrics;
        agentInputTokens += metrics.totalInputTokens;
        agentOutputTokens += metrics.totalOutputTokens;
        agentTotalTokens += metrics.totalInputTokens + metrics.totalOutputTokens;

        // Aggregate trace metrics
        aggregatedTraceMetrics.totalSteps += metrics.totalSteps;
        aggregatedTraceMetrics.orchestrationSteps += metrics.orchestrationSteps;
        aggregatedTraceMetrics.modelInvocations += metrics.modelInvocations;
        aggregatedTraceMetrics.toolInvocations += metrics.toolInvocations;
        aggregatedTraceMetrics.totalInputTokens += metrics.totalInputTokens;
        aggregatedTraceMetrics.totalOutputTokens += metrics.totalOutputTokens;
        aggregatedTraceMetrics.reasoningCaptures += metrics.reasoningCaptures;
      }

      // Record agent turn
      turns.push({
        turnNumber: turnCount,
        speaker: 'agent',
        message: agentMessage,
        timestamp: new Date().toISOString(),
        agentToolCalls,
        agentReasoning,
        latencyMs: agentTurnLatency,
        lambdaError: agentTurn.lambdaError, // Pass through Lambda error if present
      });

      Logger.debug(
        `[ConversationController] Turn ${turnCount} - Agent: ${agentMessage.substring(0, 50)}...`
      );
      if (agentToolCalls.length > 0) {
        Logger.debug(
          `[ConversationController] Agent tool calls: ${agentToolCalls.map(tc => tc.toolName).join(', ')}`
        );
      }

      // PHASE 3: Check termination conditions
      terminationDecision = this.checkTermination(
        turnCount,
        agentToolCalls,
        userResponse.shouldEnd,
        this.controlConfig.maxTurns
      );

      if (terminationDecision.shouldTerminate) {
        Logger.debug(
          `[ConversationController] Termination triggered: ${terminationDecision.reasons.join(', ')}`
        );
        break;
      }
    }

    const endTime = new Date().toISOString();

    Logger.info(`[ConversationController] ✓ Conversation complete`);
    Logger.debug(`[ConversationController] Turns: ${turns.length / 2} (${turns.length} messages)`);
    Logger.debug(
      `[ConversationController] Termination reasons: ${terminationDecision.reasons.join(', ')}`
    );
    Logger.debug(`[ConversationController] Total latency: ${totalLatencyMs}ms`);
    Logger.debug(
      `[ConversationController] User tokens: ${userSimulatorTotalTokens}, Agent tokens: ${agentTotalTokens}`
    );

    return {
      sessionId,
      scenario,
      turns,
      terminationDecision,
      totalLatencyMs,
      startTime,
      endTime,
      userSimulatorTotalTokens,
      agentTotalTokens,
      agentInputTokens,
      agentOutputTokens,
      agentTraceMetrics: aggregatedTraceMetrics,
      firstTurnPrompt,
    };
  }

  /**
   * Check 4 independent termination conditions
   *
   * Any condition can trigger termination:
   * 1. agent_escalation - Agent calls tool containing "escalate" (case-insensitive)
   * 2. completion_tool_called - Agent calls tool containing "complete" or "finish"
   * 3. user_simulator_ends - User LLM includes <END_CONVERSATION> tag
   * 4. max_turns_reached - Turn count exceeds maxTurns
   */
  private checkTermination(
    turnCount: number,
    agentToolCalls: ToolCall[],
    userSignaledEnd: boolean,
    maxTurns: number
  ): TerminationDecision {
    const reasons: string[] = [];

    // Condition 1: Agent escalation (tool name contains "escalate")
    const hasEscalation = agentToolCalls.some(tc => tc.toolName.toLowerCase().includes('escalate'));
    if (hasEscalation) {
      reasons.push('agent_escalation');
      Logger.debug('[ConversationController] Termination condition met: agent_escalation');
    }

    // Condition 2: Completion tool called (tool name contains "complete" or "finish")
    const hasCompletion = agentToolCalls.some(tc => {
      const toolName = tc.toolName.toLowerCase();
      return toolName.includes('complete') || toolName.includes('finish');
    });
    if (hasCompletion) {
      reasons.push('completion_tool_called');
      Logger.debug('[ConversationController] Termination condition met: completion_tool_called');
    }

    // Condition 3: User simulator signaled end
    if (userSignaledEnd) {
      reasons.push('user_simulator_ends');
      Logger.debug('[ConversationController] Termination condition met: user_simulator_ends');
    }

    // Condition 4: Max turns reached
    if (turnCount >= maxTurns) {
      reasons.push('max_turns_reached');
      Logger.debug('[ConversationController] Termination condition met: max_turns_reached');
    }

    return {
      shouldTerminate: reasons.length > 0,
      reasons,
      turnCount,
    };
  }

  /**
   * Build conversation history for user simulator (BLACKBOX)
   *
   * User only sees:
   * - Messages (user and agent)
   *
   * User does NOT see:
   * - Tool calls
   * - Agent reasoning
   * - Job details or company details (unless explicitly mentioned in messages)
   */
  private buildUserConversationHistory(turns: ConversationTurnDetail[]): ConversationMessage[] {
    const history: ConversationMessage[] = [];

    for (const turn of turns) {
      // Map speaker to role
      const role = turn.speaker === 'user_simulator' ? 'user' : 'agent';

      // Only include message content (blackbox enforcement)
      history.push({
        role,
        content: turn.message,
      });
    }

    return history;
  }

  /**
   * Build context data for agent
   *
   * Agent receives full context including:
   * - candidateDetails (partial info the recruiter has)
   * - jobDetails (complete job information)
   * - companyDetails (complete company/employer information)
   *
   * Supports both new asymmetric structure (contextData.agent) and legacy flat structure
   */
  private buildAgentContextData(scenario: ScenarioContext): Record<string, any> | undefined {
    const contextData: Record<string, any> = {};

    // Check for new structure (contextData.agent)
    if (scenario.contextData && 'agent' in scenario.contextData) {
      const agentContext = scenario.contextData.agent as any;

      // Extract agent's view of candidate, job, and company
      if (agentContext.candidate) {
        contextData.candidateDetails = agentContext.candidate;
      }
      if (agentContext.job) {
        contextData.jobDetails = agentContext.job;
      }
      if (agentContext.company) {
        contextData.companyDetails = agentContext.company;
      }
    } else {
      // Legacy structure: flat contextData or candidateDetails at top level
      // Add candidate details if present
      if (scenario.candidateDetails) {
        contextData.candidateDetails = scenario.candidateDetails;
      }

      // Add other context data if present (jobDetails, companyDetails, etc.)
      if (scenario.contextData) {
        Object.assign(contextData, scenario.contextData);
      }
    }

    // Return undefined if no context data
    return Object.keys(contextData).length > 0 ? contextData : undefined;
  }

  /**
   * Build a human-readable transcript for judge evaluation
   */
  static buildTranscript(result: DynamicConversationResult): string {
    const lines: string[] = [];

    lines.push(`Scenario: ${result.scenario.scenarioId}`);
    lines.push(`Session: ${result.sessionId}`);
    lines.push(`Turns: ${result.terminationDecision.turnCount}`);
    lines.push(`Termination: ${result.terminationDecision.reasons.join(', ')}`);
    lines.push('');
    lines.push('--- Conversation ---');
    lines.push('');

    for (const turn of result.turns) {
      const speaker = turn.speaker === 'user_simulator' ? 'USER' : 'AGENT';
      lines.push(`${speaker}: ${turn.message}`);

      // Include tool calls for judge visibility (not shown to user simulator)
      if (turn.agentToolCalls && turn.agentToolCalls.length > 0) {
        turn.agentToolCalls.forEach(tc => {
          lines.push(`  → Tool: ${tc.toolName}`);
          if (Object.keys(tc.parameters).length > 0) {
            lines.push(`    Parameters: ${JSON.stringify(tc.parameters)}`);
          }
        });
      }

      // Flag Lambda errors in transcript
      if (turn.lambdaError) {
        lines.push(
          `  ⚠️ [LAMBDA ERROR] ${turn.lambdaError.errorType}: ${turn.lambdaError.message}`
        );
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Destroy the agent simulator to clean up HTTP connections
   * Call this when the test runner is done to prevent hanging
   */
  destroy(): void {
    if (this.agentSimulator) {
      this.agentSimulator.destroy();
      Logger.info('[ConversationController] ✓ Agent simulator destroyed');
    }
  }
}
