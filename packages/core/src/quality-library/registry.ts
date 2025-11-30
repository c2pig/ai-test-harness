import { QualityAttributeDefinition, AttributeValidationResult } from './types';
import * as Core from './attributes/core';
import * as Conversational from './attributes/conversational';
import { CustomAttributeLoader } from './custom-loader';

/**
 * Core Quality Attribute Registry
 * Auto-populated from all exports in attribute modules
 * To add new attributes: export them from the appropriate attribute file
 * (conversational.ts, core.ts, etc.)
 */
export const QualityAttributeRegistry: Record<string, QualityAttributeDefinition> = {
  ...Core,
  ...Conversational,
};

/**
 * Get all available attributes (core + custom)
 * @returns Array of attribute names
 */
export async function getAvailableAttributes(): Promise<string[]> {
  const coreAttributes = Object.keys(QualityAttributeRegistry).sort();
  const customAttributes = await CustomAttributeLoader.listAvailable();
  return [...coreAttributes, ...customAttributes].sort();
}

/**
 * Validate attribute names (supports both core and custom attributes)
 * @param attributeNames - Array of attribute names to validate
 * @returns AttributeValidationResult with invalid attributes
 */
export async function validateAttributeNames(attributeNames: string[]): Promise<AttributeValidationResult> {
  const invalid: string[] = [];

  for (const name of attributeNames) {
    if (CustomAttributeLoader.isCustomAttribute(name)) {
      // Try to load custom attribute
      try {
        await CustomAttributeLoader.load(name);
      } catch (_error) {
        invalid.push(name);
      }
    } else {
      // Check core registry
      if (!QualityAttributeRegistry[name]) {
        invalid.push(name);
      }
    }
  }

  return {
    valid: invalid.length === 0,
    invalidAttributes: invalid,
    suggestions: {},
  };
}

/**
 * Get attribute definition (supports both core and custom attributes)
 * @param name - Attribute name (e.g., "ZeroHallucination" or "custom/quality/XMLFormatCompliance")
 * @returns QualityAttributeDefinition or undefined
 */
export async function getAttributeDefinition(
  name: string
): Promise<QualityAttributeDefinition | undefined> {
  // Check if custom attribute
  if (CustomAttributeLoader.isCustomAttribute(name)) {
    try {
      return await CustomAttributeLoader.load(name);
    } catch (_error) {
      return undefined;
    }
  }

  // Return from core registry
  return QualityAttributeRegistry[name];
}

/**
 * Get multiple attribute definitions (supports both core and custom attributes)
 * @param names - Array of attribute names
 * @returns Record of attribute definitions
 */
export async function getAttributeDefinitions(
  names: string[]
): Promise<Record<string, QualityAttributeDefinition>> {
  const definitions: Record<string, QualityAttributeDefinition> = {};

  for (const name of names) {
    const definition = await getAttributeDefinition(name);
    if (definition) {
      definitions[name] = definition;
    }
  }

  return definitions;
}
