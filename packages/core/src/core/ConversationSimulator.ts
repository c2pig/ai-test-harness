import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
  InvokeAgentCommandInput,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { Logger } from '../utils/logger';
import { BedrockTraceParser } from '../utils/BedrockTraceParser';

export interface ConversationTurn {
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  toolCalls?: ToolCall[];
  traceData?: TraceData;
  isContextInjection?: boolean; // Flag to mark context injection turns
  lambdaError?: {
    // Lambda execution failed but tool call was captured
    message: string;
    stack?: string;
    errorType: string;
  };
}

export interface ToolCall {
  toolName: string;
  parameters: Record<string, any>;
  result?: any;
}

export interface TraceData {
  reasoning?: string[]; // <thinking> tags from agent
  modelInvocations?: number; // Number of model calls
  totalInputTokens?: number;
  totalOutputTokens?: number;
  rawTrace?: any; // Full trace for debugging
}

export interface AgentTraceMetrics {
  totalSteps: number; // Total orchestration steps
  orchestrationSteps: number; // Steps with orchestration trace
  modelInvocations: number; // Total model invocation count
  toolInvocations: number; // Total tool calls
  totalInputTokens: number; // Aggregate input tokens
  totalOutputTokens: number; // Aggregate output tokens
  reasoningCaptures: number; // Number of reasoning snippets captured
  actionGroupInvocations?: Array<{
    invocationInput?: { actionGroupName?: string };
    timestamp: string;
  }>;
}

export interface ConversationResult {
  sessionId: string;
  turns: ConversationTurn[];
  totalLatencyMs: number;
  startTime: string;
  endTime: string;
  traceMetrics?: AgentTraceMetrics; // Aggregated trace metrics
}

export interface AgentConfig {
  agentId: string;
  agentAliasId: string;
  region: string;
}

export class ConversationSimulator {
  private client: BedrockAgentRuntimeClient;

  constructor(agentConfig: AgentConfig) {
    this.client = new BedrockAgentRuntimeClient({
      region: agentConfig.region,
    });
  }
  async simulate(
    agentId: string,
    agentAliasId: string,
    userMessages: string[],
    sessionId?: string,
    contextData?: Record<string, any>
  ): Promise<ConversationResult> {
    const startTime = new Date().toISOString();
    const turns: ConversationTurn[] = [];
    let totalLatencyMs = 0;

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

    // Generate session ID if not provided
    const effectiveSessionId =
      sessionId || `sim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    Logger.info(`[ConversationSimulator] Starting conversation simulation`);
    Logger.info(`[ConversationSimulator] Agent ID: ${agentId}`);
    Logger.info(`[ConversationSimulator] Agent Alias ID: ${agentAliasId}`);
    Logger.info(`[ConversationSimulator] Session ID: ${effectiveSessionId}`);
    Logger.info(`[ConversationSimulator] User messages: ${userMessages.length}`);
    if (contextData) {
      Logger.info(
        `[ConversationSimulator] Context data provided: ${Object.keys(contextData).join(', ')}`
      );
    }

    // Inject context data as initial conversation history (if provided)
    // This mimics how the original repo injects job/candidate details as assistant message
    if (contextData) {
      // Add initial "Hi" from user
      turns.push({
        role: 'user',
        content: 'Hi',
        timestamp: new Date().toISOString(),
        isContextInjection: true,
      });

      // Add context as assistant message (JSON format)
      turns.push({
        role: 'agent',
        content: JSON.stringify(contextData),
        timestamp: new Date().toISOString(),
        isContextInjection: true,
      });

      Logger.info(
        `[ConversationSimulator] Context injected as assistant message (${JSON.stringify(contextData).length} chars)`
      );
    }

    for (let i = 0; i < userMessages.length; i++) {
      const userMessage = userMessages[i];

      // Add user turn
      turns.push({
        role: 'user',
        content: userMessage,
        timestamp: new Date().toISOString(),
      });

      Logger.info(
        `[ConversationSimulator] Turn ${i + 1} - User: ${userMessage.substring(0, 50)}...`
      );

      // Invoke agent
      const turnStart = Date.now();
      const agentResponse = await this.invokeAgent(
        agentId,
        agentAliasId,
        effectiveSessionId,
        userMessage
      );
      const turnLatency = Date.now() - turnStart;
      totalLatencyMs += turnLatency;

      // Add agent turn
      turns.push({
        role: 'agent',
        content: agentResponse.text,
        timestamp: new Date().toISOString(),
        toolCalls: agentResponse.toolCalls,
        traceData: agentResponse.traceData,
        lambdaError: agentResponse.lambdaError, // Include Lambda error if present
      });

      // Aggregate trace metrics from this turn
      if (agentResponse.traceData) {
        const td = agentResponse.traceData as any; // Cast to access extended properties
        aggregatedTraceMetrics.totalSteps += td.totalSteps || 0;
        aggregatedTraceMetrics.orchestrationSteps += td.orchestrationSteps || 0;
        aggregatedTraceMetrics.modelInvocations += agentResponse.traceData.modelInvocations || 0;
        aggregatedTraceMetrics.totalInputTokens += agentResponse.traceData.totalInputTokens || 0;
        aggregatedTraceMetrics.totalOutputTokens += agentResponse.traceData.totalOutputTokens || 0;
        aggregatedTraceMetrics.reasoningCaptures += agentResponse.traceData.reasoning?.length || 0;
        aggregatedTraceMetrics.toolInvocations += agentResponse.toolCalls?.length || 0;
      }

      Logger.info(
        `[ConversationSimulator] Turn ${i + 1} - Agent: ${agentResponse.text.substring(0, 50)}... (${turnLatency}ms)`
      );
      if (agentResponse.toolCalls && agentResponse.toolCalls.length > 0) {
        Logger.info(
          `[ConversationSimulator] Tool calls: ${agentResponse.toolCalls.map(tc => tc.toolName).join(', ')}`
        );
      }
      if (agentResponse.traceData?.reasoning && agentResponse.traceData.reasoning.length > 0) {
        Logger.info(
          `[ConversationSimulator] Reasoning captured: ${agentResponse.traceData.reasoning.length} thought(s)`
        );
      }
    }

    const endTime = new Date().toISOString();

    Logger.info(
      `[ConversationSimulator] ✓ Conversation complete - ${turns.length} turns, ${totalLatencyMs}ms total`
    );
    Logger.info(
      `[ConversationSimulator] Trace metrics - Model invocations: ${aggregatedTraceMetrics.modelInvocations}, Tool calls: ${aggregatedTraceMetrics.toolInvocations}, Reasoning captures: ${aggregatedTraceMetrics.reasoningCaptures}`
    );

    return {
      sessionId: effectiveSessionId,
      turns,
      totalLatencyMs,
      startTime,
      endTime,
      traceMetrics: aggregatedTraceMetrics,
    };
  }
  private async invokeAgent(
    agentId: string,
    agentAliasId: string,
    sessionId: string,
    inputText: string
  ): Promise<{
    text: string;
    toolCalls: ToolCall[];
    traceData: TraceData;
    lambdaError?: {
      message: string;
      stack?: string;
      errorType: string;
    };
  }> {
    const input: InvokeAgentCommandInput = {
      agentId,
      agentAliasId,
      sessionId,
      inputText,
      enableTrace: true, // Enable trace capture
    };

    // Declare these outside try block so they're accessible in catch
    let agentText = '';
    const traceParser = new BedrockTraceParser();

    try {
      const command = new InvokeAgentCommand(input);
      const response = await this.client.send(command);

      if (response.completion) {
        for await (const event of response.completion) {
          // Text chunk from agent
          if (event.chunk?.bytes) {
            const text = new TextDecoder().decode(event.chunk.bytes);
            agentText += text;
          }

          // Parse trace events using BedrockTraceParser
          if (event.trace) {
            traceParser.processTraceEvent(event.trace);
          }
        }
      }

      // Get parsed results from trace parser
      const parsedTrace = traceParser.getResults();

      const traceData: TraceData & { orchestrationSteps?: number; totalSteps?: number } = {
        reasoning: parsedTrace.reasoning,
        modelInvocations: parsedTrace.modelInvocations,
        totalInputTokens: parsedTrace.totalInputTokens,
        totalOutputTokens: parsedTrace.totalOutputTokens,
        rawTrace: parsedTrace.rawTraces.length > 0 ? parsedTrace.rawTraces : undefined,
        orchestrationSteps: parsedTrace.orchestrationSteps,
        totalSteps: parsedTrace.rawTraces.length,
      };

      return {
        text: agentText.trim(),
        toolCalls: parsedTrace.toolCalls,
        traceData,
      };
    } catch (error: any) {
      // Get parsed results from trace parser (even partial results on error)
      const parsedTrace = traceParser.getResults();

      // Attach partial trace data to error object for recovery
      (error as any).partialTrace = {
        ...parsedTrace,
        agentText: agentText.trim(),
      };

      // Check if this is a Lambda failure (continue regardless of tool calls)
      const isLambdaError =
        error.name === 'DependencyFailedException' ||
        error.name === 'BadGatewayException' ||
        error.message?.includes('Lambda function') ||
        error.message?.includes('action group');

      if (isLambdaError) {
        Logger.warn(
          `[ConversationSimulator] ⚠ Lambda execution failed - continuing with mock response`
        );
        Logger.warn(`[ConversationSimulator]   Error: ${error.name} - ${error.message}`);
        Logger.warn(
          `[ConversationSimulator]   Tool calls captured: ${parsedTrace.toolCalls.length}`
        );
        Logger.warn(`[ConversationSimulator]   Continuing conversation for testing purposes`);

        // Return mock successful response with diagnostic information
        const mockText =
          agentText.trim() ||
          (parsedTrace.toolCalls.length > 0
            ? '[Lambda execution failed - tool call validated]'
            : '[Lambda execution failed - continuing conversation]');

        return {
          text: mockText,
          toolCalls: parsedTrace.toolCalls, // Contains the action the agent decided to call (may be empty)
          traceData: {
            reasoning: parsedTrace.reasoning,
            modelInvocations: parsedTrace.modelInvocations,
            totalInputTokens: parsedTrace.totalInputTokens,
            totalOutputTokens: parsedTrace.totalOutputTokens,
            rawTrace: parsedTrace.rawTraces.length > 0 ? parsedTrace.rawTraces : undefined,
            orchestrationSteps: parsedTrace.orchestrationSteps,
            totalSteps: parsedTrace.rawTraces.length,
          } as TraceData & { orchestrationSteps?: number; totalSteps?: number },
          lambdaError: {
            message: error.message,
            stack: error.stack,
            errorType: error.name,
          },
        };
      }

      // Otherwise, throw as before for other types of errors
      Logger.error('[ConversationSimulator] Failed to invoke agent', error);
      throw error;
    }
  }

  /**
   * Format conversation as a readable transcript
   */
  static formatTranscript(conversation: ConversationResult): string {
    const lines: string[] = [];
    lines.push(`Session: ${conversation.sessionId}`);
    lines.push(`Duration: ${conversation.totalLatencyMs}ms`);
    lines.push(`Turns: ${conversation.turns.length}`);
    lines.push('');
    lines.push('--- Conversation Transcript ---');
    lines.push('');

    for (let i = 0; i < conversation.turns.length; i++) {
      const turn = conversation.turns[i];

      // Special formatting for context injection
      if (turn.isContextInjection) {
        if (turn.role === 'user') {
          lines.push(`USER: ${turn.content}`);
          lines.push('');
        } else {
          lines.push('[CONTEXT INJECTION]');
          try {
            const contextData = JSON.parse(turn.content);
            lines.push(JSON.stringify(contextData, null, 2));
          } catch {
            lines.push(turn.content);
          }
          lines.push('');
        }
        continue;
      }

      // Normal turn formatting
      const speaker = turn.role === 'user' ? 'USER' : 'AGENT';
      lines.push(`${speaker}: ${turn.content}`);

      if (turn.toolCalls && turn.toolCalls.length > 0) {
        turn.toolCalls.forEach(tc => {
          lines.push(`  → Tool: ${tc.toolName}`);
          lines.push(`    Parameters: ${JSON.stringify(tc.parameters)}`);
        });
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Destroy the Bedrock Agent client to clean up HTTP connections
   * Call this when the test runner is done to prevent hanging
   */
  destroy(): void {
    if (this.client) {
      this.client.destroy();
      Logger.info('[ConversationSimulator] ✓ Bedrock Agent client destroyed');
    }
  }
}
