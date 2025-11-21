#!/usr/bin/env tsx

// Configuration Validation Tool
// Validates all configuration files before test execution using Zod schemas

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import {
  validateTenantConfig,
  validateScenario,
  validateCalibration,
  validateConnectors,
  validateModels,
  CURRENT_SCHEMA_VERSION,
} from '../schemas';

interface ValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
}

async function validateConfigs(rootDir: string): Promise<boolean> {
  console.log('=== Configuration Validator ===\n');

  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // 1. Validate shared configs with Zod schemas
  console.log('[1/7] Validating shared configuration files...');
  const modelsPath = path.join(rootDir, 'config/shared/models.yaml');
  const connectorsPath = path.join(rootDir, 'config/shared/connectors.yaml');

  let modelsData: any;
  let connectorsData: any;

  // Validate models.yaml
  if (!fs.existsSync(modelsPath)) {
    allErrors.push(`Missing config/shared/models.yaml`);
  } else {
    const modelsResult = validateModels(modelsPath);
    if (modelsResult.valid && modelsResult.data) {
      modelsData = modelsResult.data;
      console.log(`  ✓ models.yaml: ${Object.keys(modelsData.models).length} models defined`);
    } else {
      if (modelsResult.errors) {
        modelsResult.errors.forEach(err => {
          allErrors.push(`models.yaml [${err.path}]: ${err.message}`);
        });
      }
    }
  }

  // Validate connectors.yaml
  if (!fs.existsSync(connectorsPath)) {
    allErrors.push(`Missing config/shared/connectors.yaml`);
  } else {
    const connectorsResult = validateConnectors(connectorsPath);
    if (connectorsResult.valid && connectorsResult.data) {
      connectorsData = connectorsResult.data;
      console.log(
        `  ✓ connectors.yaml: ${Object.keys(connectorsData.connectors).length} connectors defined`
      );

      // Additional validation passed - outputSchema checked by Zod schema
      const connectorCount = Object.keys(connectorsData.connectors).length;
      console.log(`  ✓ All ${connectorCount} connectors validated successfully`);
    } else {
      if (connectorsResult.errors) {
        connectorsResult.errors.forEach(err => {
          allErrors.push(`connectors.yaml [${err.path}]: ${err.message}`);
        });
      }
    }
  }

  // 2. Validate framework configs
  console.log('\n[2/7] Checking framework configs...');
  const frameworkPromptsDir = path.join(rootDir, 'config/framework/prompts');
  if (fs.existsSync(frameworkPromptsDir)) {
    const promptFiles = fs.readdirSync(frameworkPromptsDir).filter(f => f.endsWith('.md'));
    console.log(`  ✓ Found ${promptFiles.length} framework prompt files`);
  } else {
    allWarnings.push(`Framework prompts directory not found: ${frameworkPromptsDir}`);
  }

  // 3. Validate tenant configs with Zod schemas
  console.log('\n[3/7] Validating tenant configuration files...');
  const tenantDirs = glob.sync('tenants/*/config.yaml', { cwd: rootDir });

  if (tenantDirs.length === 0) {
    allWarnings.push('No tenant configs found in tenants/*/config.yaml');
  } else {
    console.log(`  Found ${tenantDirs.length} tenant configs\n`);

    for (const tenantConfig of tenantDirs) {
      const fullPath = path.join(rootDir, tenantConfig);
      const tenantName = path.basename(path.dirname(tenantConfig));

      const result = validateTenantConfig(fullPath);

      if (result.valid) {
        const config = result.data;
        console.log(
          `  ✓ ${tenantName} (schema: ${config.schemaVersion}, type: ${config.testPlan.type})`
        );
      } else {
        console.log(`  ✗ ${tenantName} - VALIDATION FAILED`);
        if (result.errors) {
          result.errors.forEach(err => {
            allErrors.push(`${tenantName} [${err.path}]: ${err.message}`);
            if (err.expected) {
              console.log(`    └─ ${err.expected}`);
            }
          });
        }
      }
    }
  }

  // 4. Validate scenario files
  console.log('\n[4/7] Validating scenario files...');
  const scenarioDirs = glob.sync('tenants/*/scenarios/*.yaml', { cwd: rootDir });

  if (scenarioDirs.length === 0) {
    console.log(`  No scenario files found`);
  } else {
    console.log(`  Found ${scenarioDirs.length} scenario files\n`);
    let validScenarios = 0;

    for (const scenarioFile of scenarioDirs) {
      const fullPath = path.join(rootDir, scenarioFile);
      const tenantName = scenarioFile.split('/')[1];
      const scenarioName = path.basename(scenarioFile, '.yaml');

      const result = validateScenario(fullPath);

      if (result.valid) {
        validScenarios++;
        console.log(`  ✓ ${tenantName}/${scenarioName}`);
      } else {
        console.log(`  ✗ ${tenantName}/${scenarioName} - VALIDATION FAILED`);
        if (result.errors) {
          result.errors.forEach(err => {
            allErrors.push(`${tenantName}/scenarios/${scenarioName} [${err.path}]: ${err.message}`);
          });
        }
      }
    }

    if (validScenarios === scenarioDirs.length) {
      console.log(`\n  ✓ All ${validScenarios} scenarios validated successfully`);
    }
  }

  // 5. Validate calibration files
  console.log('\n[5/7] Validating calibration files...');
  const calibrationFiles = glob.sync('tenants/*/evaluation/calibration.yaml', { cwd: rootDir });

  if (calibrationFiles.length === 0) {
    console.log(`  No calibration files found`);
  } else {
    console.log(`  Found ${calibrationFiles.length} calibration files\n`);
    let validCalibrations = 0;

    for (const calibrationFile of calibrationFiles) {
      const fullPath = path.join(rootDir, calibrationFile);
      const tenantName = calibrationFile.split('/')[1];

      const result = validateCalibration(fullPath);

      if (result.valid) {
        validCalibrations++;
        const config = result.data;
        console.log(
          `  ✓ ${tenantName} (enabled: ${config.enabled}, examples: ${config.examples.length})`
        );
      } else {
        console.log(`  ✗ ${tenantName} - VALIDATION FAILED`);
        if (result.errors) {
          result.errors.forEach(err => {
            allErrors.push(`${tenantName}/calibration [${err.path}]: ${err.message}`);
          });
        }
      }
    }

    if (validCalibrations === calibrationFiles.length) {
      console.log(`\n  ✓ All ${validCalibrations} calibration files validated successfully`);
    }
  }

  // 6. Validate quality attributes
  console.log('\n[6/7] Checking quality attributes...');
  const qualityDir = path.join(rootDir, 'config/quality');
  if (fs.existsSync(qualityDir)) {
    const qualityFiles = fs
      .readdirSync(qualityDir)
      .filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'));
    console.log(`  ✓ Found ${qualityFiles.length} custom quality attributes`);
  } else {
    allWarnings.push(`Quality attributes directory not found: ${qualityDir}`);
  }

  // 7. Validate cross-references
  console.log('\n[7/7] Validating cross-references...');

  if (modelsData && connectorsData) {
    const modelNames = Object.keys(modelsData.models);
    const connectorNames = Object.keys(connectorsData.connectors);
    let crossRefErrors = 0;

    for (const tenantConfig of tenantDirs) {
      const fullPath = path.join(rootDir, tenantConfig);
      const tenantName = path.basename(path.dirname(tenantConfig));

      const result = validateTenantConfig(fullPath);
      if (!result.valid || !result.data) continue;

      const config = result.data;

      // Check agent/prompt references
      if (config.testPlan.type === 'text-generation') {
        if (config.testPlan.prompt && !modelNames.includes(config.testPlan.prompt)) {
          allErrors.push(`${tenantName}: references unknown prompt '${config.testPlan.prompt}'`);
          crossRefErrors++;
        }
      } else if (
        config.testPlan.type === 'agent-scenario' ||
        config.testPlan.type === 'agent-simulation'
      ) {
        if (config.testPlan.agent && !modelNames.includes(config.testPlan.agent)) {
          allErrors.push(`${tenantName}: references unknown agent '${config.testPlan.agent}'`);
          crossRefErrors++;
        }
      } else if (
        config.testPlan.type === 'agent-rerun' ||
        config.testPlan.type === 'conversation-evaluation'
      ) {
        if (config.testPlan.agent && !modelNames.includes(config.testPlan.agent)) {
          allErrors.push(`${tenantName}: references unknown agent '${config.testPlan.agent}'`);
          crossRefErrors++;
        }
      }

      // Check connector references
      if (
        config.testPlan.type === 'text-generation' ||
        config.testPlan.type === 'agent-scenario' ||
        config.testPlan.type === 'agent-simulation'
      ) {
        const connectors = config.testPlan.connectors;
        if (connectors) {
          for (const [key, connectorRef] of Object.entries(connectors)) {
            if (typeof connectorRef === 'string' && !connectorNames.includes(connectorRef)) {
              allErrors.push(
                `${tenantName}: references unknown connector '${connectorRef}' in connectors.${key}`
              );
              crossRefErrors++;
            }
          }
        }
      } else if (
        config.testPlan.type === 'agent-rerun' ||
        config.testPlan.type === 'conversation-evaluation'
      ) {
        const connectors = config.testPlan.connectors;
        if (connectors) {
          for (const [key, connectorRef] of Object.entries(connectors)) {
            if (typeof connectorRef === 'string' && !connectorNames.includes(connectorRef)) {
              allErrors.push(
                `${tenantName}: references unknown connector '${connectorRef}' in connectors.${key}`
              );
              crossRefErrors++;
            }
          }
        }
      }
    }

    if (crossRefErrors === 0) {
      console.log(`  ✓ All cross-references validated successfully`);
    } else {
      console.log(`  ✗ Found ${crossRefErrors} cross-reference errors`);
    }
  } else {
    allWarnings.push(`Could not validate cross-references: shared configs not loaded`);
  }

  // Print results
  console.log('\n' + '='.repeat(70));
  console.log('VALIDATION RESULTS');
  console.log('='.repeat(70) + '\n');

  if (allWarnings.length > 0) {
    console.log(`⚠  Warnings (${allWarnings.length}):`);
    allWarnings.forEach(w => console.log(`   ${w}`));
    console.log('');
  }

  if (allErrors.length > 0) {
    console.log(`✗  Errors (${allErrors.length}):`);
    allErrors.forEach(e => console.log(`   ${e}`));
    console.log('\n✗ VALIDATION FAILED');
    console.log('\nFor schema documentation and migration guide, see:');
    console.log(`  docs/config-schema.md`);
    console.log(`\nCurrent schema version: ${CURRENT_SCHEMA_VERSION}\n`);
    return false;
  }

  console.log('✓ VALIDATION PASSED');
  console.log(
    `\nAll configuration files validated successfully using schema version ${CURRENT_SCHEMA_VERSION}\n`
  );
  return true;
}

async function main() {
  const rootDir = path.resolve(__dirname, '../..');
  const success = await validateConfigs(rootDir);
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
