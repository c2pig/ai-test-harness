import {
  BaseValidator,
  ValidationResult,
  ValidationContext,
  ToolCallValidatorConfig,
} from './types';

/**
 * Validator for tool call requirements
 *
 * Validates that the correct tools were called during a test.
 * Can check for required tools, forbidden tools, and call count constraints.
 */
export class ToolCallValidator implements BaseValidator {
  readonly name = 'ToolCallValidator';
  private config: ToolCallValidatorConfig;

  constructor(config: ToolCallValidatorConfig) {
    this.config = config;
  }

  async validate(context: ValidationContext): Promise<ValidationResult> {
    const { toolCalls = [] } = context;

    // Extract tool names from tool calls
    const toolNames = toolCalls.map(call => call.name);
    const uniqueToolNames = Array.from(new Set(toolNames));

    const violations: string[] = [];

    // Check required tools
    if (this.config.requiredTools && this.config.requiredTools.length > 0) {
      const missingTools = this.config.requiredTools.filter(
        tool => !uniqueToolNames.includes(tool)
      );
      if (missingTools.length > 0) {
        violations.push(`Missing required tools: ${missingTools.join(', ')}`);
      }
    }

    // Check forbidden tools
    if (this.config.forbiddenTools && this.config.forbiddenTools.length > 0) {
      const forbiddenCalled = this.config.forbiddenTools.filter(tool =>
        uniqueToolNames.includes(tool)
      );
      if (forbiddenCalled.length > 0) {
        violations.push(`Forbidden tools called: ${forbiddenCalled.join(', ')}`);
      }
    }

    // Check minimum call count
    if (this.config.minCalls !== undefined && toolCalls.length < this.config.minCalls) {
      violations.push(`Insufficient tool calls: ${toolCalls.length} < ${this.config.minCalls}`);
    }

    // Check maximum call count
    if (this.config.maxCalls !== undefined && toolCalls.length > this.config.maxCalls) {
      violations.push(`Too many tool calls: ${toolCalls.length} > ${this.config.maxCalls}`);
    }

    const passed = violations.length === 0;

    return {
      validatorName: this.name,
      passed,
      message: passed
        ? `All tool call requirements met (${toolCalls.length} calls)`
        : violations.join('; '),
      metadata: {
        toolCalls: toolNames,
        uniqueTools: uniqueToolNames,
        callCount: toolCalls.length,
        config: this.config,
      },
    };
  }
}
