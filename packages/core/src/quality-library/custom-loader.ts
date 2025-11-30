import * as path from 'path';
import * as fs from 'fs';
import { QualityAttributeDefinition } from './types';
import { Logger } from '../utils/logger';

// Load custom quality attributes from config/custom/ (framework + custom attributes)
export class CustomAttributeLoader {
  private static readonly CUSTOM_PREFIX = 'custom/';
  private static readonly FRAMEWORK_CUSTOM_PATH = path.resolve(__dirname, '../../config/custom');
  private static projectPath: string | null = null;
  private static attributeCache: Map<string, QualityAttributeDefinition> = new Map();

  /**
   * Set the project path for loading custom attributes
   * Must be called before loading any custom attributes
   */
  static setProjectPath(projectPath: string): void {
    this.projectPath = projectPath;
    this.clearCache(); // Clear cache when project path changes
  }

  /**
   * Get the current project path
   */
  static getProjectPath(): string | null {
    return this.projectPath;
  }

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

    const [rawCategory, attributeName] = parts;

    // Normalize "qualities" to "quality" for backward compatibility
    const category = rawCategory === 'qualities' ? 'quality' : rawCategory;

    return { category, attributeName };
  }

  static async load(attributePath: string): Promise<QualityAttributeDefinition> {
    // Check cache first
    if (this.attributeCache.has(attributePath)) {
      return this.attributeCache.get(attributePath)!;
    }

    // Parse path
    const { category, attributeName } = this.parseCustomPath(attributePath);

    Logger.debug(
      `[CustomAttributeLoader] Loading: ${attributePath} (category=${category}, name=${attributeName})`
    );

    // Build potential file paths (project first, then framework)
    const potentialPaths: string[] = [];

    if (this.projectPath) {
      // Check project custom/qualities/ (CLI convention)
      potentialPaths.push(
        path.join(this.projectPath, 'custom', 'qualities', `${attributeName}.ts`)
      );
      // Check project custom/quality/ (framework convention)
      potentialPaths.push(path.join(this.projectPath, 'custom', 'quality', `${attributeName}.ts`));
    }

    // Framework path
    potentialPaths.push(path.join(this.FRAMEWORK_CUSTOM_PATH, category, `${attributeName}.ts`));

    // Find first existing file
    let filePath: string | null = null;
    for (const p of potentialPaths) {
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    }

    if (!filePath) {
      throw new Error(
        `Custom attribute file not found. Searched:\n` +
          potentialPaths.map(p => `  - ${p}`).join('\n')
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
            `Expected: export const ${attributeName} = { ... }`
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
    const basePaths: string[] = [this.FRAMEWORK_CUSTOM_PATH];

    // Add project custom paths if set
    if (this.projectPath) {
      basePaths.push(path.join(this.projectPath, 'custom'));
    }

    try {
      for (const basePath of basePaths) {
        // Check if custom directory exists
        if (!fs.existsSync(basePath)) {
          continue;
        }

        // Read categories (subdirectories under custom/)
        const categories = fs
          .readdirSync(basePath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);

        // For each category, list .ts files
        for (const category of categories) {
          const categoryPath = path.join(basePath, category);
          const files = fs
            .readdirSync(categoryPath)
            .filter(file => file.endsWith('.ts') && !file.endsWith('.d.ts'));

          for (const file of files) {
            const attributeName = file.replace('.ts', '');
            // Normalize to "quality" format for consistency
            const normalizedCategory = category === 'qualities' ? 'quality' : category;
            const attrPath = `custom/${normalizedCategory}/${attributeName}`;
            if (!attributes.includes(attrPath)) {
              attributes.push(attrPath);
            }
          }
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
