import { ConversationTurn, ToolCall } from '../core/ConversationSimulator';
import { Logger } from './logger';

export interface ToolValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    expectedTools: string[];
    actualTools: string[];
    missingTools: string[];
    unexpectedTools: string[];
    correctTools: string[];
  };
}

export class ToolCallValidator {
  /**
   * Validate tool calls in a conversation against expected outcomes
   */
  static validate(
    conversationTurns: ConversationTurn[],
    expectedToolCalls?: string[]
  ): ToolValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Extract all tool calls from conversation
    const actualToolCalls: ToolCall[] = [];
    for (const turn of conversationTurns) {
      if (turn.role === 'agent' && turn.toolCalls) {
        actualToolCalls.push(...turn.toolCalls);
      }
    }

    const actualTools = actualToolCalls.map(tc => tc.toolName);
    const expectedTools = expectedToolCalls || [];

    // If no expected tools specified, just warn if tools were called
    if (expectedTools.length === 0) {
      if (actualTools.length > 0) {
        warnings.push(`No expected tools specified, but agent called: ${actualTools.join(', ')}`);
      }
      return {
        passed: true,
        errors: [],
        warnings,
        summary: {
          expectedTools: [],
          actualTools,
          missingTools: [],
          unexpectedTools: [],
          correctTools: [],
        },
      };
    }

    // Find missing tools (expected but not called)
    const missingTools = expectedTools.filter(expected => {
      return !actualTools.some(actual => this.toolNamesMatch(actual, expected));
    });

    // Find unexpected tools (called but not expected)
    const unexpectedTools = actualTools.filter(actual => {
      // Filter out 'unknown' tool names (couldn't parse from trace)
      if (actual === 'unknown') {
        warnings.push(`Tool call detected but name couldn't be parsed from trace`);
        return false;
      }
      return !expectedTools.some(expected => this.toolNamesMatch(actual, expected));
    });

    // Find correct tools (expected and called)
    const correctTools = expectedTools.filter(expected => {
      return actualTools.some(actual => this.toolNamesMatch(actual, expected));
    });

    // Build error messages
    if (missingTools.length > 0) {
      errors.push(`Missing expected tool calls: ${missingTools.join(', ')}`);
    }

    if (unexpectedTools.length > 0) {
      errors.push(`Unexpected tool calls: ${unexpectedTools.join(', ')}`);
    }

    // Check for duplicate tool calls (warning, not error)
    const toolCounts = new Map<string, number>();
    for (const tool of actualTools) {
      toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
    }
    for (const [tool, count] of toolCounts.entries()) {
      if (count > 1) {
        warnings.push(`Tool "${tool}" was called ${count} times (possible duplicate)`);
      }
    }

    const passed = errors.length === 0;

    if (passed) {
      Logger.info(`[ToolCallValidator] ✓ Tool validation passed - all expected tools called`);
    } else {
      Logger.warn(`[ToolCallValidator] ✗ Tool validation failed`);
      errors.forEach(error => Logger.warn(`[ToolCallValidator]   - ${error}`));
    }

    if (warnings.length > 0) {
      warnings.forEach(warning => Logger.warn(`[ToolCallValidator]   ⚠ ${warning}`));
    }

    return {
      passed,
      errors,
      warnings,
      summary: {
        expectedTools,
        actualTools,
        missingTools,
        unexpectedTools,
        correctTools,
      },
    };
  }

  /**
   * Check if two tool names match (case-insensitive, handles variations)
   */
  private static toolNamesMatch(actual: string, expected: string): boolean {
    // Exact match (case-insensitive)
    if (actual.toLowerCase() === expected.toLowerCase()) {
      return true;
    }

    // Handle snake_case vs camelCase variations
    const normalize = (str: string) => str.toLowerCase().replace(/[_-]/g, '');
    if (normalize(actual) === normalize(expected)) {
      return true;
    }

    return false;
  }

  /**
   * Extract tool call summary for logging/reporting
   */
  static summarizeToolCalls(conversationTurns: ConversationTurn[]): string[] {
    const toolCalls: string[] = [];

    for (let i = 0; i < conversationTurns.length; i++) {
      const turn = conversationTurns[i];
      if (turn.role === 'agent' && turn.toolCalls && turn.toolCalls.length > 0) {
        turn.toolCalls.forEach(tc => {
          const params =
            Object.keys(tc.parameters).length > 0
              ? ` (${JSON.stringify(tc.parameters).substring(0, 50)}...)`
              : '';
          toolCalls.push(`Turn ${Math.floor(i / 2) + 1}: ${tc.toolName}${params}`);
        });
      }
    }

    return toolCalls;
  }
}
