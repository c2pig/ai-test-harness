import * as path from 'path';
import * as fs from 'fs';
import { QualityAttributeDefinition } from './types';
import { Logger } from '../utils/logger';

// Load custom quality attributes from config/custom/ (framework + custom attributes)
export class CustomAttributeLoader {
  private static readonly CUSTOM_PREFIX = 'custom/';
  private static readonly CUSTOM_BASE_PATH = path.resolve(__dirname, '../../config/custom');
  private static attributeCache: Map<string, QualityAttributeDefinition> = new Map();

  static isCustomAttribute(name: string): boolean {
    return name.toLowerCase().startsWith(this.CUSTOM_PREFIX);
  }

  static parseCustomPath(attributePath: string): { category: string; attributeName: string } {
    // Remove "custom/" prefix
    const withoutPrefix = attributePath.substring(this.CUSTOM_PREFIX.length);

    // Split into parts: ["quality", "XMLFormatCompliance"]
    const parts = withoutPrefix.split('/');

    if (parts.length !== 2) {
      throw new Error(
        `Invalid custom attribute path: "${attributePath}". Expected format: "custom/{category}/{attributeName}"`
      );
    }

    const [category, attributeName] = parts;
    return { category, attributeName };
  }

  static async load(attributePath: string): Promise<QualityAttributeDefinition> {
    // Check cache first
    if (this.attributeCache.has(attributePath)) {
      return this.attributeCache.get(attributePath)!;
    }

    // Parse path
    const { category, attributeName } = this.parseCustomPath(attributePath);

    // Build file path: config/{category}/{attributeName}.ts
    const filePath = path.join(this.CUSTOM_BASE_PATH, category, `${attributeName}.ts`);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(
        `Custom attribute file not found: ${filePath}\n` +
          `Expected path: custom/${category}/${attributeName}.ts`
      );
    }

    try {
      // Dynamic import of the custom attribute module
      const module = await import(filePath);

      // Extract the named export matching the attribute name
      const attributeDefinition = module[attributeName];

      if (!attributeDefinition) {
        throw new Error(
          `Custom attribute "${attributeName}" not exported from ${filePath}\n` +
            `Expected: export const ${attributeName}: QualityAttributeDefinition = { ... }`
        );
      }

      // Validate structure
      if (
        !attributeDefinition.name ||
        !attributeDefinition.description ||
        !attributeDefinition.rating
      ) {
        throw new Error(
          `Invalid custom attribute definition in ${filePath}\n` +
            `Must have: name, description, rating fields`
        );
      }

      // Cache and return
      this.attributeCache.set(attributePath, attributeDefinition);
      Logger.info(`[CustomAttributeLoader] ✓ Loaded custom attribute: ${attributePath}`);

      return attributeDefinition;
    } catch (error: any) {
      if (error.message.includes('Custom attribute')) {
        throw error; // Re-throw custom errors
      }
      throw new Error(`Failed to load custom attribute from ${filePath}: ${error.message}`);
    }
  }

  /**
   * List all available custom attributes
   * @returns Array of custom attribute paths (e.g., ["custom/quality/XMLFormatCompliance", ...])
   */
  static async listAvailable(): Promise<string[]> {
    const attributes: string[] = [];

    try {
      // Check if custom directory exists
      if (!fs.existsSync(this.CUSTOM_BASE_PATH)) {
        return attributes;
      }

      // Read categories (subdirectories under config/)
      const categories = fs
        .readdirSync(this.CUSTOM_BASE_PATH, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      // For each category, list .ts files
      for (const category of categories) {
        const categoryPath = path.join(this.CUSTOM_BASE_PATH, category);
        const files = fs
          .readdirSync(categoryPath)
          .filter(file => file.endsWith('.ts') && !file.endsWith('.d.ts'));

        for (const file of files) {
          const attributeName = file.replace('.ts', '');
          attributes.push(`custom/${category}/${attributeName}`);
        }
      }

      return attributes.sort();
    } catch (error) {
      Logger.warn(`[CustomAttributeLoader] Failed to list custom attributes: ${error}`);
      return attributes;
    }
  }

  /**
   * Clear the attribute cache (useful for testing)
   */
  static clearCache(): void {
    this.attributeCache.clear();
  }
}
