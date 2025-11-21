/**
 * Schema Version Management
 *
 * This module defines the current schema version and supported versions
 * for configuration files (config.yaml, scenario.yaml, calibration.yaml).
 */

/**
 * Current schema version following semantic versioning
 */
export const CURRENT_SCHEMA_VERSION = '1.0.0';

/**
 * List of all supported schema versions
 * Older versions should be listed here if backward compatibility is maintained
 */
export const SUPPORTED_SCHEMA_VERSIONS = ['1.0.0'] as const;

/**
 * Type for supported schema versions
 */
export type SupportedSchemaVersion = (typeof SUPPORTED_SCHEMA_VERSIONS)[number];

/**
 * Validates if a schema version is supported
 */
export function isSupportedVersion(version: string): version is SupportedSchemaVersion {
  return SUPPORTED_SCHEMA_VERSIONS.includes(version as SupportedSchemaVersion);
}

/**
 * Validates semantic versioning format (X.Y.Z)
 */
export function isValidSemver(version: string): boolean {
  const semverRegex = /^\d+\.\d+\.\d+$/;
  return semverRegex.test(version);
}

/**
 * Schema version validation result
 */
export interface SchemaVersionValidation {
  valid: boolean;
  version?: string;
  error?: string;
  suggestion?: string;
}

/**
 * Validates a schema version string
 */
export function validateSchemaVersion(version: unknown): SchemaVersionValidation {
  // Check if version exists
  if (version === undefined || version === null) {
    return {
      valid: false,
      error: `Missing required 'schemaVersion' field`,
      suggestion: `Add 'schemaVersion: "${CURRENT_SCHEMA_VERSION}"' at the top of your config file`,
    };
  }

  // Check if version is a string
  if (typeof version !== 'string') {
    return {
      valid: false,
      error: `'schemaVersion' must be a string, got ${typeof version}`,
      suggestion: `Change to 'schemaVersion: "${CURRENT_SCHEMA_VERSION}"'`,
    };
  }

  // Check if version follows semver format
  if (!isValidSemver(version)) {
    return {
      valid: false,
      version,
      error: `'schemaVersion' must follow semantic versioning format (X.Y.Z), got "${version}"`,
      suggestion: `Use format like "${CURRENT_SCHEMA_VERSION}"`,
    };
  }

  // Check if version is supported
  if (!isSupportedVersion(version)) {
    return {
      valid: false,
      version,
      error: `Unsupported schema version "${version}". Supported versions: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}`,
      suggestion: `Update to current version "${CURRENT_SCHEMA_VERSION}" or see migration guide at docs/config-schema.md`,
    };
  }

  return {
    valid: true,
    version,
  };
}
