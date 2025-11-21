/**
 * Schema Validator Utility
 *
 * Provides validation functions for configuration files using Zod schemas
 */

import { z, ZodError } from 'zod';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { TenantConfigSchema } from './config-schema';
import { ScenarioSchema } from './scenario-schema';
import { CalibrationConfigSchema } from './calibration-schema';
import { ConnectorsFileSchema, ModelsFileSchema } from './shared-schema';
import { validateSchemaVersion } from './version';

/**
 * Validation result for a single file
 */
export interface ValidationResult {
  valid: boolean;
  filePath: string;
  errors?: ValidationError[];
  data?: any;
}

/**
 * Validation error details
 */
export interface ValidationError {
  path: string;
  message: string;
  expected?: string;
}

/**
 * Formats Zod validation errors into user-friendly format
 */
function formatZodErrors(error: ZodError, filePath: string): ValidationError[] {
  return error.errors.map(err => {
    const pathStr = err.path.join('.');
    return {
      path: pathStr || 'root',
      message: err.message,
      expected:
        err.code === 'invalid_type'
          ? `expected ${(err as any).expected}, got ${(err as any).received}`
          : undefined,
    };
  });
}

/**
 * Loads and parses a YAML file
 */
function loadYamlFile(filePath: string): any {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    return yaml.load(fileContent);
  } catch (error: any) {
    throw new Error(`Failed to load YAML file: ${error.message}`);
  }
}

/**
 * Validates schema version first, then validates with Zod schema
 */
function validateWithSchema<T>(
  schema: z.ZodSchema<T>,
  data: any,
  filePath: string,
  requireSchemaVersion: boolean = false
): ValidationResult {
  try {
    // Check schema version if required
    if (requireSchemaVersion) {
      const versionCheck = validateSchemaVersion(data.schemaVersion);
      if (!versionCheck.valid) {
        return {
          valid: false,
          filePath,
          errors: [
            {
              path: 'schemaVersion',
              message: versionCheck.error || 'Invalid schema version',
              expected: versionCheck.suggestion,
            },
          ],
        };
      }
    }

    // Validate with Zod schema
    const parsed = schema.parse(data);
    return {
      valid: true,
      filePath,
      data: parsed,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        valid: false,
        filePath,
        errors: formatZodErrors(error, filePath),
      };
    }
    throw error;
  }
}

// ============================================================================
// Public Validation Functions
// ============================================================================

/**
 * Validates a tenant config.yaml file
 */
export function validateTenantConfig(filePath: string): ValidationResult {
  try {
    const data = loadYamlFile(filePath);
    return validateWithSchema(TenantConfigSchema, data, filePath, true);
  } catch (error: any) {
    return {
      valid: false,
      filePath,
      errors: [
        {
          path: 'file',
          message: error.message,
        },
      ],
    };
  }
}

/**
 * Validates a scenario.yaml file
 */
export function validateScenario(filePath: string): ValidationResult {
  try {
    const data = loadYamlFile(filePath);
    return validateWithSchema(ScenarioSchema, data, filePath, false);
  } catch (error: any) {
    return {
      valid: false,
      filePath,
      errors: [
        {
          path: 'file',
          message: error.message,
        },
      ],
    };
  }
}

/**
 * Validates a calibration.yaml file
 */
export function validateCalibration(filePath: string): ValidationResult {
  try {
    const data = loadYamlFile(filePath);
    return validateWithSchema(CalibrationConfigSchema, data, filePath, false);
  } catch (error: any) {
    return {
      valid: false,
      filePath,
      errors: [
        {
          path: 'file',
          message: error.message,
        },
      ],
    };
  }
}

/**
 * Validates a connectors.yaml file
 */
export function validateConnectors(filePath: string): ValidationResult {
  try {
    const data = loadYamlFile(filePath);
    return validateWithSchema(ConnectorsFileSchema, data, filePath, false);
  } catch (error: any) {
    return {
      valid: false,
      filePath,
      errors: [
        {
          path: 'file',
          message: error.message,
        },
      ],
    };
  }
}

/**
 * Validates a models.yaml file
 */
export function validateModels(filePath: string): ValidationResult {
  try {
    const data = loadYamlFile(filePath);
    return validateWithSchema(ModelsFileSchema, data, filePath, false);
  } catch (error: any) {
    return {
      valid: false,
      filePath,
      errors: [
        {
          path: 'file',
          message: error.message,
        },
      ],
    };
  }
}

/**
 * Formats validation result for CLI output
 */
export function formatValidationResult(result: ValidationResult): string {
  if (result.valid) {
    return `✓ ${result.filePath} - Valid`;
  }

  const lines = [`✗ ${result.filePath} - Invalid`];

  if (result.errors) {
    result.errors.forEach(err => {
      lines.push(`  Field: ${err.path}`);
      lines.push(`  Error: ${err.message}`);
      if (err.expected) {
        lines.push(`  ${err.expected}`);
      }
      lines.push('');
    });
  }

  return lines.join('\n');
}

/**
 * Validates all configuration files for a tenant
 */
export interface TenantValidationResult {
  tenantPath: string;
  configValid: boolean;
  scenariosValid: boolean;
  calibrationValid: boolean;
  results: {
    config?: ValidationResult;
    scenarios?: ValidationResult[];
    calibration?: ValidationResult;
  };
}

/**
 * Validates all files for a tenant directory
 */
export async function validateTenant(tenantPath: string): Promise<TenantValidationResult> {
  const results: TenantValidationResult = {
    tenantPath,
    configValid: false,
    scenariosValid: true, // default true, set false if any scenario fails
    calibrationValid: true, // default true, set false if calibration exists and fails
    results: {},
  };

  // Validate config.yaml
  const configPath = path.join(tenantPath, 'config.yaml');
  if (fs.existsSync(configPath)) {
    results.results.config = validateTenantConfig(configPath);
    results.configValid = results.results.config.valid;
  }

  // Validate scenarios if they exist
  const scenariosDir = path.join(tenantPath, 'scenarios');
  if (fs.existsSync(scenariosDir)) {
    const scenarioFiles = fs
      .readdirSync(scenariosDir)
      .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

    results.results.scenarios = scenarioFiles.map(file => {
      const result = validateScenario(path.join(scenariosDir, file));
      if (!result.valid) {
        results.scenariosValid = false;
      }
      return result;
    });
  }

  // Validate calibration if it exists
  const calibrationPath = path.join(tenantPath, 'evaluation', 'calibration.yaml');
  if (fs.existsSync(calibrationPath)) {
    results.results.calibration = validateCalibration(calibrationPath);
    results.calibrationValid = results.results.calibration.valid;
  }

  return results;
}
