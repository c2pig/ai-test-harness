/**
 * Expected Tool Call Validator
 *
 * Validates actual tool calls against a predefined list of expected tool calls.
 * Supports parameter validation with placeholder patterns ({{variable}}).
 * Used by AgentReplayTestRunner for config-based tool validation.
 */

import { Logger } from '../utils/logger';

export interface ExpectedToolCall {
  name: string;
  triggerCondition: string;
  parameters?: Record<string, any>;
}

export interface ExpectedToolCallConfig {
  expectedToolCalls: ExpectedToolCall[];
}

export interface ExpectedToolCallResult {
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

export class ExpectedToolCallValidator {
  private config: ExpectedToolCallConfig;

  constructor(config: ExpectedToolCallConfig) {
    this.config = config;
    Logger.debug(
      `[ExpectedToolCallValidator] Initialized with ${config.expectedToolCalls.length} expected tool calls`
    );
  }

  /**
   * Validate actual tool calls against expected configuration
   */
  validate(
    actualToolCalls: { toolName: string; parameters: Record<string, any> }[]
  ): ExpectedToolCallResult {
    Logger.debug(`[ExpectedToolCallValidator] Validating ${actualToolCalls.length} actual tool calls`);

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

        Logger.debug(`[ExpectedToolCallValidator] ✓ Expected tool call found: ${actualCall.toolName}`);
      } else {
        // Unexpected call
        unexpectedToolCalls.push(actualCall.toolName);
        Logger.debug(`[ExpectedToolCallValidator] ⚠ Unexpected tool call: ${actualCall.toolName}`);
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
        Logger.debug(`[ExpectedToolCallValidator] ⚠ Missing expected tool call: ${expected.name}`);
      }
    }

    const validationPassed =
      missingToolCalls.length === 0 &&
      unexpectedToolCalls.length === 0 &&
      details.every(d => d.parameterMatch !== false);

    Logger.info(`[ExpectedToolCallValidator] Validation ${validationPassed ? 'PASSED' : 'FAILED'}`);

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
        Logger.debug(`[ExpectedToolCallValidator] Parameter missing: ${key}`);
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
        Logger.debug(
          `[ExpectedToolCallValidator] Parameter mismatch: ${key} - expected ${expectedValue}, got ${actual[key]}`
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

    for (const msg of messageHistory) {
      if (msg.role === 'assistant' && msg.toolCalls) {
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

