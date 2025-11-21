import { BaseValidator } from './types';
import { ToolCallValidator } from './ToolCallValidator';
import { CostValidator } from './CostValidator';
import { LatencyValidator } from './LatencyValidator';

/**
 * Simple validator configuration from YAML
 *
 * Example:
 * ```yaml
 * validators:
 *   toolCalls:
 *     - method_a
 *     - method_b
 *   latencyMs:
 *     lt: 100
 *     gt: 10
 *   cost:
 *     lt: 0.05
 * ```
 */
export interface SimpleValidatorConfig {
  toolCalls?: string[];
  latencyMs?: {
    lt?: number;
    gt?: number;
  };
  cost?: {
    lt?: number;
    gt?: number;
  };
}

/**
 * Create validators from simple configuration format
 *
 * @param config - Simple validator configuration from YAML
 * @returns Array of validator instances
 */
export function createValidators(config: SimpleValidatorConfig): BaseValidator[] {
  const validators: BaseValidator[] = [];

  // Create ToolCallValidator if toolCalls is specified
  if (config.toolCalls && config.toolCalls.length > 0) {
    validators.push(
      new ToolCallValidator({
        requiredTools: config.toolCalls,
      })
    );
  }

  // Create LatencyValidator if latencyMs is specified
  if (config.latencyMs) {
    const latencyConfig = config.latencyMs;
    if (latencyConfig.lt !== undefined) {
      validators.push(
        new LatencyValidator({
          maxLatencyMs: latencyConfig.lt,
          warningThresholdMs: latencyConfig.gt,
        })
      );
    }
  }

  // Create CostValidator if cost is specified
  if (config.cost) {
    const costConfig = config.cost;
    if (costConfig.lt !== undefined) {
      validators.push(
        new CostValidator({
          maxCost: costConfig.lt,
          warningThreshold: costConfig.gt,
        })
      );
    }
  }

  return validators;
}
