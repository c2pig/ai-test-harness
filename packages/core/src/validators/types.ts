/**
 * Validator Types
 *
 * Defines the types and interfaces for the validation system.
 */

/**
 * Validation result for a single test case
 */
export interface ValidationResult {
  /** Name of the validator that produced this result */
  validatorName: string;

  /** Whether the validation passed */
  passed: boolean;

  /** Validation message providing details about the result */
  message: string;

  /** Optional metadata about the validation */
  metadata?: Record<string, any>;
}

/**
 * Context provided to validators during validation
 */
export interface ValidationContext {
  /** The test case being validated */
  testCase: any;

  /** Test case result with assessment and metrics */
  result: any;

  /** Optional LLM metrics */
  llmMetrics?: {
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    cost?: number;
  };

  /** Optional tool calls made during the test */
  toolCalls?: Array<{
    name: string;
    timestamp?: string;
    [key: string]: any;
  }>;
}

/**
 * Base validator interface that all validators must implement
 */
export interface BaseValidator {
  /** Unique name for this validator */
  readonly name: string;

  /**
   * Validate a single test case
   * @param context - The validation context containing test case and results
   * @returns Promise resolving to validation result
   */
  validate(context: ValidationContext): Promise<ValidationResult>;
}

/**
 * Tool call validator configuration
 */
export interface ToolCallValidatorConfig {
  /** List of tool names that must be called */
  requiredTools?: string[];

  /** List of tool names that must not be called */
  forbiddenTools?: string[];

  /** Minimum number of tool calls expected */
  minCalls?: number;

  /** Maximum number of tool calls allowed */
  maxCalls?: number;
}

/**
 * Cost validator configuration
 */
export interface CostValidatorConfig {
  /** Maximum cost allowed per test case (in USD) */
  maxCost: number;

  /** Warning threshold (in USD) - triggers warning but doesn't fail */
  warningThreshold?: number;
}

/**
 * Latency validator configuration
 */
export interface LatencyValidatorConfig {
  /** Maximum latency allowed (in milliseconds) */
  maxLatencyMs: number;

  /** Warning threshold (in milliseconds) - triggers warning but doesn't fail */
  warningThresholdMs?: number;
}

/**
 * Validator factory type for creating validators from configuration
 */
export type ValidatorFactory = (config: any) => BaseValidator;
