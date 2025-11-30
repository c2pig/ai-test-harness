import { Logger } from '../utils/logger';
import { ConfigLoader } from '../utils/ConfigLoader';
import { LoadedTenantConfig } from '../schemas/config-schema';
import {
  validateAttributeNames,
  getAvailableAttributes,
  buildQualityAssessmentSchema,
} from '../quality-library';
import { ZodSchema } from 'zod';

/**
 * Result from running tests
 */
export interface TestRunResult {
  totalTests: number;
  passed: number;
  failed: number;
  avgScore?: number;
  results: any[];
}

/**
 * BaseRunner - Abstract base class for all test runners
 *
 * Provides common functionality:
 * - Config loading and validation
 * - Quality attribute validation and schema building
 * - Summary and assessment printing
 * - Run timestamp generation
 * - Error artifact writing
 *
 * Subclasses must implement:
 * - executeTests(): Core test execution logic
 */
export abstract class BaseRunner {
  protected abstract getRunnerName(): string;
  protected abstract getExpectedTestPlanType(): string;

  /**
   * Main entry point for test execution
   */
  async run(tenantName: string): Promise<void> {
    const runTimestamp = this.generateRunTimestamp();
    const runnerName = this.getRunnerName();

    Logger.info(`[${runnerName}] Starting quality assessment for: ${tenantName}`);
    Logger.debug(`[${runnerName}] Run timestamp: ${runTimestamp}`);

    const configPath = `./examples/${tenantName}/config.yaml`;
    Logger.debug(`[${runnerName}] Loading config from: ${configPath}`);

    const config = await ConfigLoader.load(configPath);
    Logger.info(`[${runnerName}] ✓ Config loaded: ${config.project.description}`);

    // Validate test plan type
    const expectedType = this.getExpectedTestPlanType();
    if (config.testPlan.type !== expectedType) {
      throw new Error(
        `${runnerName} can only process ${expectedType} test plans, got ${config.testPlan.type}`
      );
    }

    try {
      // Execute test-specific logic
      await this.executeTests(tenantName, config, runTimestamp);
    } catch (error) {
      Logger.error(`[${runnerName}] Test execution failed:`, error);

      // Write error artifact if implemented by subclass
      await this.writeErrorArtifact(tenantName, runTimestamp, error);

      throw error;
    }
  }

  /**
   * Run with pre-loaded config (for external projects)
   * Bypasses tenant path resolution - used by @ai-test-harness/cli
   */
  async runWithConfig(projectName: string, config: LoadedTenantConfig): Promise<TestRunResult> {
    const runTimestamp = this.generateRunTimestamp();
    const runnerName = this.getRunnerName();

    Logger.info(`[${runnerName}] Starting quality assessment for: ${projectName}`);
    Logger.debug(`[${runnerName}] Run timestamp: ${runTimestamp}`);
    Logger.debug(`[${runnerName}] Config: ${config.project.description}`);

    // Validate test plan type
    const expectedType = this.getExpectedTestPlanType();
    if (config.testPlan.type !== expectedType) {
      throw new Error(
        `${runnerName} can only process ${expectedType} test plans, got ${config.testPlan.type}`
      );
    }

    try {
      // Execute test-specific logic and return results
      return await this.executeTests(projectName, config, runTimestamp);
    } catch (error) {
      Logger.error(`[${runnerName}] Test execution failed:`, error);

      // Write error artifact if implemented by subclass
      await this.writeErrorArtifact(projectName, runTimestamp, error);

      throw error;
    }
  }

  /**
   * Generate standardized run timestamp: yyyy-MM-dd_HH-mm-ss
   */
  protected generateRunTimestamp(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
  }

  /**
   * Validate quality attributes and build schema
   * Returns: { schema, attributeNames }
   */
  protected async validateAndBuildQualitySchema(
    config: LoadedTenantConfig,
    runnerName: string
  ): Promise<{ schema: ZodSchema<any>; attributeNames: string[] }> {
    const attributeNames = config.evaluationPlan.qualityAssessment?.attributes || [];

    if (attributeNames.length === 0) {
      throw new Error(
        'No quality attributes configured. Add qualityAssessment.attributes to your config.yaml'
      );
    }

    Logger.debug(`[${runnerName}] Validating ${attributeNames.length} quality attributes...`);
    const validation = await validateAttributeNames(attributeNames);

    if (!validation.valid) {
      const available = await getAvailableAttributes();
      throw new Error(
        `Invalid quality attributes: ${validation.invalidAttributes.join(', ')}. Available: ${available.join(', ')}`
      );
    }

    Logger.info(`[${runnerName}] ✓ Quality attributes valid: ${attributeNames.join(', ')}`);

    // Build dynamic schema from configured attributes
    const schema = await buildQualityAssessmentSchema(attributeNames);
    Logger.info(`[${runnerName}] ✓ Schema built for ${attributeNames.length} attributes`);

    return { schema, attributeNames };
  }

  /**
   * Print individual assessment result
   */
  protected printAssessment(recommendationId: string, assessment: any): void {
    const lines: string[] = [`\n--- Match ${recommendationId} ---`];
    Object.entries(assessment).forEach(([capability, data]: [string, any]) => {
      const score = data.score;
      const grade = data.grade || '';
      const status = score >= 4 ? '✓' : score >= 3 ? '⚠' : '✗';
      lines.push(`  ${status} ${capability}: ${score}/5 (${grade}) - ${data.reason}`);
    });
    Logger.debug(lines.join('\n'));
  }

  /**
   * Print aggregate summary across all results
   */
  protected printSummary(results: any[]): void {
    const lines: string[] = [`\n${'='.repeat(80)}`, 'QUALITY ASSESSMENT SUMMARY', '='.repeat(80)];

    // Collect ALL unique capabilities across ALL results
    const capabilitiesSet = new Set<string>();
    results.forEach(result => {
      Object.keys(result.assessment).forEach(cap => capabilitiesSet.add(cap));
    });
    const capabilities = Array.from(capabilitiesSet);

    const aggregated: Record<string, { total: number; count: number; passed: number }> = {};

    capabilities.forEach(cap => {
      aggregated[cap] = { total: 0, count: 0, passed: 0 };
    });

    results.forEach(result => {
      Object.entries(result.assessment).forEach(([cap, data]: [string, any]) => {
        aggregated[cap].total += data.score;
        aggregated[cap].count++;
        if (data.score >= 4) aggregated[cap].passed++;
      });
    });

    Object.entries(aggregated).forEach(([cap, stats]) => {
      const avgScore = (stats.total / stats.count).toFixed(1);
      const passRate = ((stats.passed / stats.count) * 100).toFixed(1);
      lines.push(`${cap}: Avg ${avgScore}/5, Pass Rate ${passRate}%`);
    });

    lines.push('='.repeat(80));
    lines.push(`Total tests: ${results.length}`);

    Logger.debug(lines.join('\n'));
  }

  /**
   * Abstract method: Subclasses must implement test execution logic
   */
  protected abstract executeTests(
    tenantName: string,
    config: LoadedTenantConfig,
    runTimestamp: string
  ): Promise<TestRunResult>;

  /**
   * Optional: Write error artifact when test execution fails
   * Default implementation does nothing - subclasses can override
   */
  protected async writeErrorArtifact(
    _tenantName: string,
    _runTimestamp: string,
    _error: any
  ): Promise<void> {
    // Default: no-op
    // Subclasses can override to write error artifacts
  }
}
