import { BaseValidator, ValidationContext, ValidationResult } from '../validators';
import { Logger } from './logger';

/**
 * Utility for running validators against test results
 */
export class ValidationRunner {
  /**
   * Run all validators against a test case and return results
   *
   * @param validators - Array of validator instances
   * @param testCase - The test case being validated
   * @param result - The test result
   * @param llmMetrics - Optional LLM metrics (tokens, latency, cost)
   * @param toolCalls - Optional tool calls made during the test
   * @returns Promise resolving to array of validation results
   */
  static async runValidators(
    validators: BaseValidator[] | undefined,
    testCase: any,
    result: any,
    llmMetrics?: {
      inputTokens: number;
      outputTokens: number;
      latencyMs: number;
      cost?: number;
    },
    toolCalls?: Array<{ name: string; timestamp?: string; [key: string]: any }>
  ): Promise<ValidationResult[]> {
    // If no validators configured, return empty array
    if (!validators || validators.length === 0) {
      return [];
    }

    const context: ValidationContext = {
      testCase,
      result,
      llmMetrics,
      toolCalls,
    };

    const validationResults: ValidationResult[] = [];

    for (const validator of validators) {
      try {
        const validationResult = await validator.validate(context);
        validationResults.push(validationResult);

        // Log validation result
        const status = validationResult.passed ? '✓' : '✗';
        Logger.info(`[ValidationRunner] ${status} ${validator.name}: ${validationResult.message}`);
      } catch (error) {
        Logger.error(`[ValidationRunner] Error running validator ${validator.name}`, error);
        // Continue with other validators even if one fails
        validationResults.push({
          validatorName: validator.name,
          passed: false,
          message: `Validator error: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    return validationResults;
  }
}
