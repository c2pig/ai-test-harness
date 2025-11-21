import { Logger } from '../utils/logger';

export interface ExpectedToolCall {
  name: string;
  triggerCondition: string;
  parameters?: Record<string, any>;
}

export interface ToolCallValidationConfig {
  expectedToolCalls: ExpectedToolCall[];
}

export interface ToolCallValidationResult {
  expectedToolCallsFound: string[];
  unexpectedToolCalls: string[];
  missingToolCalls: string[];
  validationPassed: boolean;
  details: {
    toolName: string;
    found: boolean;
    triggerCondition?: string;
    parameterMatch?: boolean;
  }[];
}

export class ToolCallValidator {
  private config: ToolCallValidationConfig;

  constructor(config: ToolCallValidationConfig) {
    this.config = config;
    Logger.info(
      `[ToolCallValidator] Initialized with ${config.expectedToolCalls.length} expected tool calls`
    );
  }

  /**
   * Validate actual tool calls against expected configuration
   */
  validate(
    actualToolCalls: { toolName: string; parameters: Record<string, any> }[]
  ): ToolCallValidationResult {
    Logger.info(`[ToolCallValidator] Validating ${actualToolCalls.length} actual tool calls`);

    const expectedToolCallsFound: string[] = [];
    const unexpectedToolCalls: string[] = [];
    const missingToolCalls: string[] = [];
    const details: {
      toolName: string;
      found: boolean;
      triggerCondition?: string;
      parameterMatch?: boolean;
    }[] = [];

    // Track which expected calls were found
    const expectedCallsStatus = this.config.expectedToolCalls.map(expected => ({
      ...expected,
      found: false,
    }));

    // Check each actual tool call
    for (const actualCall of actualToolCalls) {
      const matchingExpected = expectedCallsStatus.find(
        exp => exp.name === actualCall.toolName && !exp.found
      );

      if (matchingExpected) {
        // Expected call found
        matchingExpected.found = true;
        expectedToolCallsFound.push(actualCall.toolName);

        // Optionally validate parameters if specified
        let parameterMatch = true;
        if (matchingExpected.parameters) {
          parameterMatch = this.validateParameters(
            matchingExpected.parameters,
            actualCall.parameters
          );
        }

        details.push({
          toolName: actualCall.toolName,
          found: true,
          triggerCondition: matchingExpected.triggerCondition,
          parameterMatch,
        });

        Logger.info(`[ToolCallValidator] ✓ Expected tool call found: ${actualCall.toolName}`);
      } else {
        // Unexpected call
        unexpectedToolCalls.push(actualCall.toolName);
        Logger.warn(`[ToolCallValidator] ⚠ Unexpected tool call: ${actualCall.toolName}`);
      }
    }

    // Find missing expected calls
    for (const expected of expectedCallsStatus) {
      if (!expected.found) {
        missingToolCalls.push(expected.name);
        details.push({
          toolName: expected.name,
          found: false,
          triggerCondition: expected.triggerCondition,
        });
        Logger.warn(`[ToolCallValidator] ⚠ Missing expected tool call: ${expected.name}`);
      }
    }

    const validationPassed =
      missingToolCalls.length === 0 &&
      unexpectedToolCalls.length === 0 &&
      details.every(d => d.parameterMatch !== false);

    Logger.info(`[ToolCallValidator] Validation ${validationPassed ? 'PASSED' : 'FAILED'}`);
    Logger.info(`[ToolCallValidator] - Expected found: ${expectedToolCallsFound.length}`);
    Logger.info(`[ToolCallValidator] - Unexpected: ${unexpectedToolCalls.length}`);
    Logger.info(`[ToolCallValidator] - Missing: ${missingToolCalls.length}`);

    return {
      expectedToolCallsFound,
      unexpectedToolCalls,
      missingToolCalls,
      validationPassed,
      details,
    };
  }

  /**
   * Simple parameter validation - checks if expected parameters exist in actual
   */
  private validateParameters(expected: Record<string, any>, actual: Record<string, any>): boolean {
    for (const [key, expectedValue] of Object.entries(expected)) {
      // Check if key exists
      if (!(key in actual)) {
        Logger.warn(`[ToolCallValidator] Parameter missing: ${key}`);
        return false;
      }

      // If expectedValue is a placeholder pattern ({{variable}}), skip value check
      if (
        typeof expectedValue === 'string' &&
        expectedValue.startsWith('{{') &&
        expectedValue.endsWith('}}')
      ) {
        // Just check presence, not value
        continue;
      }

      // Check value match
      if (actual[key] !== expectedValue) {
        Logger.warn(
          `[ToolCallValidator] Parameter mismatch: ${key} - expected ${expectedValue}, got ${actual[key]}`
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Extract tool calls from message history
   */
  static extractToolCallsFromHistory(
    messageHistory: any[]
  ): { toolName: string; parameters: Record<string, any> }[] {
    const toolCalls: { toolName: string; parameters: Record<string, any> }[] = [];

    // Look for tool usage patterns in message content or metadata
    // This is a placeholder - actual implementation depends on how tools are stored
    for (const msg of messageHistory) {
      if (msg.role === 'assistant' && msg.toolCalls) {
        // If tool calls are explicitly stored
        msg.toolCalls.forEach((tc: any) => {
          toolCalls.push({
            toolName: tc.toolName || tc.name,
            parameters: tc.parameters || {},
          });
        });
      }
    }

    return toolCalls;
  }
}
