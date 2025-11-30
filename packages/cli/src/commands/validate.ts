/**
 * Validate Command
 *
 * Comprehensive validation of project configuration.
 * Validates config.yaml, connectors, prompts, scenarios, and calibration files.
 *
 * Usage:
 *   ai-test-harness validate
 *   ai-test-harness validate --config=staging.yaml
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import {
  validateTenantConfig,
  validateScenario,
  validateCalibration,
  validateConnectors,
  validateModels,
  CURRENT_SCHEMA_VERSION,
} from '@ai-test-harness/core';

interface ValidateCommandOptions {
  config: string;
}

interface ValidationSummary {
  errors: string[];
  warnings: string[];
}

export async function validateCommand(options: ValidateCommandOptions): Promise<void> {
  console.log(chalk.bold('\n✅ AI Test Harness - Validate Configuration\n'));

  const spinner = ora('Validating project...').start();
  const projectDir = process.cwd();
  const summary: ValidationSummary = { errors: [], warnings: [] };

  try {
    // Step 1: Validate main config.yaml
    spinner.text = '[1/5] Validating config.yaml...';
    validateMainConfig(projectDir, options.config, summary);

    // Step 2: Validate connectors
    spinner.text = '[2/5] Validating connectors...';
    validateConnectorsFile(projectDir, summary);

    // Step 3: Validate prompts
    spinner.text = '[3/5] Validating prompts...';
    validatePromptsFile(projectDir, summary);

    // Step 4: Validate scenarios (if they exist)
    spinner.text = '[4/5] Validating scenarios...';
    validateScenariosDir(projectDir, summary);

    // Step 5: Validate calibration
    spinner.text = '[5/5] Validating calibration...';
    validateCalibrationDir(projectDir, summary);

    spinner.stop();

    // Print results
    printResults(summary);
  } catch (error) {
    spinner.fail('Validation failed');
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

function validateMainConfig(
  projectDir: string,
  configFile: string,
  summary: ValidationSummary
): void {
  const configPath = path.join(projectDir, configFile);

  if (!fs.existsSync(configPath)) {
    summary.errors.push(`Config file not found: ${configFile}`);
    return;
  }

  const result = validateTenantConfig(configPath);

  if (result.valid && result.data) {
    console.log(
      chalk.green(
        `  ✓ ${configFile} (schema: ${result.data.schemaVersion}, type: ${result.data.testPlan.type})`
      )
    );
  } else {
    console.log(chalk.red(`  ✗ ${configFile} - VALIDATION FAILED`));
    if (result.errors) {
      result.errors.forEach((err: { path: string; message: string }) => {
        summary.errors.push(`${configFile} [${err.path}]: ${err.message}`);
      });
    }
  }
}

function validateConnectorsFile(projectDir: string, summary: ValidationSummary): void {
  const connectorsPath = path.join(projectDir, 'config', 'shared', 'connectors.yaml');

  if (!fs.existsSync(connectorsPath)) {
    summary.warnings.push('config/shared/connectors.yaml not found');
    console.log(chalk.yellow(`  ⚠ connectors.yaml not found`));
    return;
  }

  const result = validateConnectors(connectorsPath);

  if (result.valid && result.data) {
    const count = Object.keys(result.data.connectors || {}).length;
    console.log(chalk.green(`  ✓ connectors.yaml (${count} connectors defined)`));
  } else {
    console.log(chalk.red(`  ✗ connectors.yaml - VALIDATION FAILED`));
    if (result.errors) {
      result.errors.forEach((err: { path: string; message: string }) => {
        summary.errors.push(`connectors.yaml [${err.path}]: ${err.message}`);
      });
    }
  }
}

function validatePromptsFile(projectDir: string, summary: ValidationSummary): void {
  const promptsPath = path.join(projectDir, 'config', 'shared', 'prompts.yaml');

  if (!fs.existsSync(promptsPath)) {
    summary.warnings.push('config/shared/prompts.yaml not found');
    console.log(chalk.yellow(`  ⚠ prompts.yaml not found`));
    return;
  }

  const result = validateModels(promptsPath);

  if (result.valid && result.data) {
    const count = Object.keys(result.data.models || {}).length;
    console.log(chalk.green(`  ✓ prompts.yaml (${count} prompts defined)`));
  } else {
    console.log(chalk.red(`  ✗ prompts.yaml - VALIDATION FAILED`));
    if (result.errors) {
      result.errors.forEach((err: { path: string; message: string }) => {
        summary.errors.push(`prompts.yaml [${err.path}]: ${err.message}`);
      });
    }
  }
}

function validateScenariosDir(projectDir: string, summary: ValidationSummary): void {
  const scenariosDir = path.join(projectDir, 'scenarios');

  if (!fs.existsSync(scenariosDir)) {
    console.log(chalk.dim(`  - No scenarios directory found (optional)`));
    return;
  }

  const scenarioFiles = fs
    .readdirSync(scenariosDir)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  if (scenarioFiles.length === 0) {
    console.log(chalk.dim(`  - No scenario files found in scenarios/`));
    return;
  }

  let validCount = 0;
  for (const file of scenarioFiles) {
    const filePath = path.join(scenariosDir, file);
    const result = validateScenario(filePath);

    if (result.valid) {
      validCount++;
    } else {
      console.log(chalk.red(`  ✗ scenarios/${file} - VALIDATION FAILED`));
      if (result.errors) {
        result.errors.forEach((err: { path: string; message: string }) => {
          summary.errors.push(`scenarios/${file} [${err.path}]: ${err.message}`);
        });
      }
    }
  }

  if (validCount === scenarioFiles.length) {
    console.log(chalk.green(`  ✓ scenarios/ (${validCount} scenarios validated)`));
  }
}

function validateCalibrationDir(projectDir: string, summary: ValidationSummary): void {
  const calibrationDir = path.join(projectDir, 'calibration');

  if (!fs.existsSync(calibrationDir)) {
    summary.warnings.push('calibration/ directory not found');
    console.log(chalk.yellow(`  ⚠ calibration/ directory not found`));
    return;
  }

  const calibrationFiles = fs
    .readdirSync(calibrationDir)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  if (calibrationFiles.length === 0) {
    summary.warnings.push('No calibration files found');
    console.log(chalk.yellow(`  ⚠ No calibration files found`));
    return;
  }

  let validCount = 0;
  for (const file of calibrationFiles) {
    const filePath = path.join(calibrationDir, file);
    const result = validateCalibration(filePath);

    if (result.valid && result.data) {
      validCount++;
      console.log(
        chalk.green(
          `  ✓ calibration/${file} (enabled: ${result.data.enabled}, ${result.data.examples?.length || 0} examples)`
        )
      );
    } else {
      console.log(chalk.red(`  ✗ calibration/${file} - VALIDATION FAILED`));
      if (result.errors) {
        result.errors.forEach((err: { path: string; message: string }) => {
          summary.errors.push(`calibration/${file} [${err.path}]: ${err.message}`);
        });
      }
    }
  }
}

function printResults(summary: ValidationSummary): void {
  console.log('\n' + '='.repeat(60));
  console.log('VALIDATION RESULTS');
  console.log('='.repeat(60) + '\n');

  if (summary.warnings.length > 0) {
    console.log(chalk.yellow(`⚠  Warnings (${summary.warnings.length}):`));
    summary.warnings.forEach(w => console.log(`   ${w}`));
    console.log('');
  }

  if (summary.errors.length > 0) {
    console.log(chalk.red(`✗  Errors (${summary.errors.length}):`));
    summary.errors.forEach(e => console.log(`   ${e}`));
    console.log(chalk.red('\n✗ VALIDATION FAILED\n'));
    console.log(`Schema version: ${CURRENT_SCHEMA_VERSION}`);
    process.exit(1);
  }

  console.log(chalk.green('✓ VALIDATION PASSED'));
  console.log(`\nAll configuration files validated (schema version ${CURRENT_SCHEMA_VERSION})\n`);
}
