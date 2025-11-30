import {
  BaseValidator,
  ValidationResult,
  ValidationContext,
  LatencyValidatorConfig,
} from './types';

/**
 * Validator for latency constraints
 *
 * Validates that the test case latency does not exceed specified thresholds.
 * Can provide warnings for latencies approaching the limit.
 */
export class LatencyValidator implements BaseValidator {
  readonly name = 'LatencyValidator';
  private config: LatencyValidatorConfig;

  constructor(config: LatencyValidatorConfig) {
    this.config = config;
  }

  async validate(context: ValidationContext): Promise<ValidationResult> {
    const latencyMs = context.llmMetrics?.latencyMs;

    // If latency is not available, skip validation
    if (latencyMs === undefined || latencyMs === null) {
      return {
        validatorName: this.name,
        passed: true,
        message: 'Latency data not available - validation skipped',
        metadata: {
          config: this.config,
        },
      };
    }

    const exceeded = latencyMs > this.config.maxLatencyMs;
    const warningThreshold = this.config.warningThresholdMs ?? this.config.maxLatencyMs * 0.8;
    const approachingLimit = latencyMs > warningThreshold && latencyMs <= this.config.maxLatencyMs;

    let message = '';
    if (exceeded) {
      message = `Latency exceeded: ${latencyMs}ms > ${this.config.maxLatencyMs}ms`;
    } else if (approachingLimit) {
      message = `Latency approaching limit: ${latencyMs}ms (threshold: ${warningThreshold}ms)`;
    } else {
      message = `Latency within limits: ${latencyMs}ms ≤ ${this.config.maxLatencyMs}ms`;
    }

    return {
      validatorName: this.name,
      passed: !exceeded,
      message,
      metadata: {
        latencyMs,
        maxLatencyMs: this.config.maxLatencyMs,
        warningThresholdMs: warningThreshold,
        percentOfLimit: (latencyMs / this.config.maxLatencyMs) * 100,
      },
    };
  }
}
