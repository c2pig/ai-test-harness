/**
 * Main Entry Point for Running Tests
 *
 * This module provides a programmatic API for running tests from external projects.
 * Used by the @ai-test-harness/cli package.
 */

import * as path from 'path';
import * as fs from 'fs';
import { ConfigLoader } from './utils/ConfigLoader';
import { type LoadedTenantConfig } from './schemas';
import { TestRunner } from './core/TestRunner';
import { AgentTestRunner } from './core/AgentTestRunner';
import { AgentSimulationRunner } from './core/AgentSimulationRunner';
import { Logger } from './utils/logger';

/**
 * Options for running tests
 */
export interface RunTestsOptions {
  /** Path to the project directory (default: current working directory) */
  projectPath?: string;

  /** Path to config file relative to projectPath (default: config.yaml) */
  configFile?: string;

  /** Override model ID for testing */
  modelOverride?: string;

  /** Environment name (dev, staging, production) */
  environment?: string;

  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Result from running tests
 */
export interface RunTestsResult {
  success: boolean;
  outputDir: string;
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    avgScore?: number;
  };
  errors?: string[];
}

/**
 * Run tests for a project
 *
 * @param options - Test run options
 * @returns Test results
 *
 * @example
 * ```typescript
 * import { runTests } from '@ai-test-harness/core';
 *
 * const result = await runTests({
 *   projectPath: './my-llm-tests',
 *   configFile: 'config.yaml',
 * });
 *
 * if (result.success) {
 *   console.log(`Tests passed! Output: ${result.outputDir}`);
 * }
 * ```
 */
export async function runTests(options: RunTestsOptions = {}): Promise<RunTestsResult> {
  const projectPath = options.projectPath || process.cwd();
  const configFile = options.configFile || 'config.yaml';
  const configPath = path.join(projectPath, configFile);

  // Validate config exists
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  Logger.info(`[Runner] Loading config from: ${configPath}`);

  // Load configuration to determine test type
  const config = await loadProjectConfig(projectPath, configFile);

  // Select appropriate runner based on test type
  const runner = createRunner(config.testPlan.type);

  // Run tests - Use runWithConfig for external projects
  // This bypasses the tenant path resolution in BaseRunner.run()
  const originalCwd = process.cwd();
  
  try {
    // Change to project directory so relative paths work
    process.chdir(projectPath);
    
    // Use runWithConfig which accepts pre-loaded config
    // projectName is used for output directory naming
    const result = await runner.runWithConfig(path.basename(projectPath), config);

    return {
      success: true,
      outputDir: path.join(projectPath, 'outputs'),
      summary: {
        totalTests: result.totalTests,
        passed: result.passed,
        failed: result.failed,
        avgScore: result.avgScore,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.error(`[Runner] Test execution failed: ${errorMessage}`);

    return {
      success: false,
      outputDir: path.join(projectPath, 'outputs'),
      summary: {
        totalTests: 0,
        passed: 0,
        failed: 0,
      },
      errors: [errorMessage],
    };
  } finally {
    // Restore original directory
    process.chdir(originalCwd);
  }
}

/**
 * Load project configuration
 */
async function loadProjectConfig(
  projectPath: string,
  configFile: string
): Promise<LoadedTenantConfig> {
  // Set up paths for config loading
  const originalCwd = process.cwd();

  try {
    // Change to project directory for relative path resolution
    process.chdir(projectPath);

    // Load config using the existing ConfigLoader (static method)
    const config = await ConfigLoader.load(configFile);

    return config;
  } finally {
    // Restore original directory
    process.chdir(originalCwd);
  }
}

/**
 * Create the appropriate runner based on test type
 */
function createRunner(testType: string) {
  switch (testType) {
    case 'text-generation':
      return new TestRunner();

    case 'agent-scenario':
      return new AgentTestRunner();

    case 'agent-simulation':
      return new AgentSimulationRunner();

    default:
      throw new Error(`Unknown test type: ${testType}`);
  }
}

/**
 * Validation result with detailed information
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  details: {
    config?: { valid: boolean; schemaVersion?: string; testType?: string };
    connectors?: { valid: boolean; count: number };
    prompts?: { valid: boolean; count: number };
    scenarios?: { valid: boolean; count: number };
    calibration?: { valid: boolean; enabled?: boolean; exampleCount?: number };
    data?: { valid: boolean; count: number };
  };
}

/**
 * Validate a project configuration without running tests
 *
 * Performs comprehensive validation:
 * - config.yaml schema validation
 * - config/shared/connectors.yaml validation
 * - config/shared/prompts.yaml validation
 * - scenarios/ validation (for agent tests)
 * - calibration/ validation
 * - data/ files check
 * - Cross-reference validation
 */
export async function validateProject(projectPath: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: ValidationResult['details'] = {};

  // 1. Validate config.yaml
  const configPath = path.join(projectPath, 'config.yaml');
  if (!fs.existsSync(configPath)) {
    errors.push('config.yaml not found');
    details.config = { valid: false };
  } else {
    try {
      const config = await loadProjectConfig(projectPath, 'config.yaml');
      details.config = {
        valid: true,
        schemaVersion: config.schemaVersion,
        testType: config.testPlan.type,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`config.yaml: ${msg}`);
      details.config = { valid: false };
    }
  }

  // 2. Validate config/shared/connectors.yaml
  const connectorsPath = path.join(projectPath, 'config', 'shared', 'connectors.yaml');
  if (!fs.existsSync(connectorsPath)) {
    warnings.push('config/shared/connectors.yaml not found');
    details.connectors = { valid: false, count: 0 };
  } else {
    try {
      const yaml = await import('yaml');
      const content = fs.readFileSync(connectorsPath, 'utf-8');
      const data = yaml.parse(content);
      const count = data?.connectors ? Object.keys(data.connectors).length : 0;
      details.connectors = { valid: true, count };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`connectors.yaml: ${msg}`);
      details.connectors = { valid: false, count: 0 };
    }
  }

  // 3. Validate config/shared/prompts.yaml
  const promptsPath = path.join(projectPath, 'config', 'shared', 'prompts.yaml');
  if (!fs.existsSync(promptsPath)) {
    warnings.push('config/shared/prompts.yaml not found');
    details.prompts = { valid: false, count: 0 };
  } else {
    try {
      const yaml = await import('yaml');
      const content = fs.readFileSync(promptsPath, 'utf-8');
      const data = yaml.parse(content);
      const count = data?.models ? Object.keys(data.models).length : 0;
      details.prompts = { valid: true, count };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`prompts.yaml: ${msg}`);
      details.prompts = { valid: false, count: 0 };
    }
  }

  // 4. Validate scenarios (for agent tests)
  const scenariosPath = path.join(projectPath, 'scenarios');
  if (fs.existsSync(scenariosPath)) {
    try {
      const files = fs.readdirSync(scenariosPath).filter(f => f.endsWith('.yaml'));
      details.scenarios = { valid: true, count: files.length };
      if (files.length === 0) {
        warnings.push('scenarios/ directory is empty');
      }
    } catch (error) {
      details.scenarios = { valid: false, count: 0 };
    }
  } else {
    // Only warn if config suggests agent test type
    if (details.config?.testType?.includes('agent')) {
      warnings.push('scenarios/ directory not found (required for agent tests)');
    }
    details.scenarios = { valid: true, count: 0 };
  }

  // 5. Validate calibration
  const calibrationPath = path.join(projectPath, 'calibration');
  if (fs.existsSync(calibrationPath)) {
    const calibFiles = fs.readdirSync(calibrationPath).filter(f => f.endsWith('.yaml'));
    if (calibFiles.length > 0) {
      try {
        const yaml = await import('yaml');
        const content = fs.readFileSync(path.join(calibrationPath, calibFiles[0]), 'utf-8');
        const data = yaml.parse(content);
        details.calibration = {
          valid: true,
          enabled: data?.enabled ?? false,
          exampleCount: data?.examples?.length ?? 0,
        };
      } catch (error) {
        details.calibration = { valid: false };
        warnings.push('calibration file could not be parsed');
      }
    } else {
      details.calibration = { valid: true, enabled: false, exampleCount: 0 };
      warnings.push('calibration/ directory is empty');
    }
  } else {
    warnings.push('calibration/ directory not found');
    details.calibration = { valid: true, enabled: false, exampleCount: 0 };
  }

  // 6. Validate data files
  const dataPath = path.join(projectPath, 'data');
  if (fs.existsSync(dataPath)) {
    const dataFiles = fs.readdirSync(dataPath).filter(f =>
      f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.txt')
    );
    details.data = { valid: true, count: dataFiles.length };
    if (dataFiles.length === 0) {
      warnings.push('data/ directory has no data files');
    }
  } else {
    warnings.push('data/ directory not found');
    details.data = { valid: false, count: 0 };
  }

  // 7. Cross-reference validation
  if (details.config?.valid && details.connectors?.valid && details.prompts?.valid) {
    // TODO: Add cross-reference checks between config references and actual definitions
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    details,
  };
}

