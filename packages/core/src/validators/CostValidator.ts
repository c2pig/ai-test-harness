import { BaseValidator, ValidationResult, ValidationContext, CostValidatorConfig } from './types';

/**
 * Validator for cost constraints
 *
 * Validates that the test case cost does not exceed specified thresholds.
 * Can provide warnings for costs approaching the limit.
 */
export class CostValidator implements BaseValidator {
  readonly name = 'CostValidator';
  private config: CostValidatorConfig;

  constructor(config: CostValidatorConfig) {
    this.config = config;
  }

  async validate(context: ValidationContext): Promise<ValidationResult> {
    const cost = context.llmMetrics?.cost;

    // If cost is not available, skip validation
    if (cost === undefined || cost === null) {
      return {
        validatorName: this.name,
        passed: true,
        message: 'Cost data not available - validation skipped',
        metadata: {
          config: this.config,
        },
      };
    }

    const exceeded = cost > this.config.maxCost;
    const warningThreshold = this.config.warningThreshold ?? this.config.maxCost * 0.8;
    const approachingLimit = cost > warningThreshold && cost <= this.config.maxCost;

    let message = '';
    if (exceeded) {
      message = `Cost exceeded: $${cost.toFixed(4)} > $${this.config.maxCost.toFixed(4)}`;
    } else if (approachingLimit) {
      message = `Cost approaching limit: $${cost.toFixed(4)} (threshold: $${warningThreshold.toFixed(4)})`;
    } else {
      message = `Cost within limits: $${cost.toFixed(4)} ≤ $${this.config.maxCost.toFixed(4)}`;
    }

    return {
      validatorName: this.name,
      passed: !exceeded,
      message,
      metadata: {
        cost,
        maxCost: this.config.maxCost,
        warningThreshold,
        percentOfLimit: (cost / this.config.maxCost) * 100,
      },
    };
  }
}
