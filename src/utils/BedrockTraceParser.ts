import { Logger } from './logger';

export interface ToolCall {
  toolName: string;
  parameters: Record<string, any>;
  result?: any;
}

export interface ParsedTrace {
  reasoning: string[];
  toolCalls: ToolCall[];
  modelInvocations: number;
  orchestrationSteps: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  rawTraces: any[];
}

/**
 * BedrockTraceParser
 *
 * Extracts and parses trace data from Bedrock Agent streaming responses.
 * Handles orchestration traces, model invocations, tool calls, and token usage.
 */
export class BedrockTraceParser {
  private reasoning: string[] = [];
  private toolCalls: ToolCall[] = [];
  private modelInvocations = 0;
  private orchestrationSteps = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private rawTraces: any[] = [];

  /**
   * Process a single trace event from Bedrock Agent stream
   */
  processTraceEvent(traceEvent: any): void {
    if (!traceEvent?.trace) return;

    const trace = traceEvent.trace;
    this.rawTraces.push(trace);

    // Count orchestration steps
    if (trace.orchestrationTrace) {
      this.orchestrationSteps++;
      this.parseOrchestrationTrace(trace.orchestrationTrace);
    }
  }

  /**
   * Parse orchestration trace for reasoning, tool calls, and token usage
   */
  private parseOrchestrationTrace(orchestrationTrace: any): void {
    // Extract reasoning (rationale)
    if (orchestrationTrace.rationale?.text) {
      this.reasoning.push(orchestrationTrace.rationale.text);
    }

    // Extract tool calls from action group invocation output
    if (orchestrationTrace.observation?.actionGroupInvocationOutput) {
      this.parseActionGroupOutput(orchestrationTrace.observation.actionGroupInvocationOutput);
    }

    // Track model invocations
    if (orchestrationTrace.modelInvocationInput) {
      this.modelInvocations++;
    }

    // Extract token usage from model output
    if (orchestrationTrace.modelInvocationOutput) {
      this.parseModelOutput(orchestrationTrace.modelInvocationOutput);
    }
  }

  /**
   * Extract tool call information from action group output
   */
  private parseActionGroupOutput(invocation: any): void {
    let toolName = 'unknown';
    let parameters = {};

    // Parse from execution result if available
    if (invocation.text) {
      try {
        // Tool output often contains JSON with execution details
        const parsed = JSON.parse(invocation.text);
        if (parsed.actionGroup) toolName = parsed.actionGroup;
        if (parsed.function) toolName = parsed.function;
        if (parsed.parameters) parameters = parsed.parameters;
      } catch {
        // If not JSON, use text as-is
      }
    }

    this.toolCalls.push({
      toolName,
      parameters,
      result: invocation.text,
    });
  }

  /**
   * Extract token usage and tool invocations from model output
   */
  private parseModelOutput(modelOutput: any): void {
    // Extract usage statistics
    if (modelOutput.metadata?.usage) {
      this.totalInputTokens += modelOutput.metadata.usage.inputTokens || 0;
      this.totalOutputTokens += modelOutput.metadata.usage.outputTokens || 0;
    }

    // Extract tool calls from rawResponse (captures agent's DECISION to call tools)
    // This is important for capturing tool calls even when Lambda execution fails
    if (modelOutput.rawResponse?.content) {
      try {
        const responseContent = JSON.parse(modelOutput.rawResponse.content);
        const message = responseContent.output?.message;

        if (message?.content && Array.isArray(message.content)) {
          message.content.forEach((item: any) => {
            if (item.toolUse) {
              this.parseToolUse(item.toolUse);
            }
          });
        }
      } catch (parseError) {
        Logger.debug('[BedrockTraceParser] Could not parse model output for tool calls');
      }
    }
  }

  /**
   * Parse tool use from model response content
   */
  private parseToolUse(toolUse: any): void {
    // Extract action group and function name
    // Format is typically: "actionGroup__FunctionName"
    const fullName = toolUse.name || 'unknown';
    const [actionGroup, funcName] = fullName.split('__');

    this.toolCalls.push({
      toolName: funcName || fullName,
      parameters: toolUse.input || {},
      result: undefined, // No result yet, this is just the invocation
    });

    Logger.info(`[BedrockTraceParser] Captured tool invocation: ${funcName || fullName}`);
  }

  /**
   * Get final parsed results
   */
  getResults(): ParsedTrace {
    return {
      reasoning: this.reasoning,
      toolCalls: this.toolCalls,
      modelInvocations: this.modelInvocations,
      orchestrationSteps: this.orchestrationSteps,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      rawTraces: this.rawTraces,
    };
  }

  /**
   * Reset parser state for reuse
   */
  reset(): void {
    this.reasoning = [];
    this.toolCalls = [];
    this.modelInvocations = 0;
    this.orchestrationSteps = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.rawTraces = [];
  }
}
