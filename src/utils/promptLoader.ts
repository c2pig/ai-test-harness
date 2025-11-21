import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Logger } from './logger';

export interface PromptVersionMetadata {
  stable?: boolean;
  deprecated?: boolean;
  experimental?: boolean;
  createdDate?: string;
  description?: string;
}

export interface PromptSection {
  [key: string]: string | null;
}

// Prompt version with reusable text blocks and ordered sections
export interface PromptVersion {
  metadata: PromptVersionMetadata;
  reusableTextBlocks: Record<string, string>;
  promptStructure: PromptSection[];
}

export interface PromptManifest {
  metadata: {
    name: string;
    currentVersion: string;
    description?: string;
  };
  outputSchema?: any; // Optional: JSON schema for judge output validation
  templateStructure?: {
    excludedFields?: string[];
    templateVariables?: string[];
  };
  versions: Record<string, PromptVersion>;
}

// Load versioned prompts from config/framework/prompts/*.yaml (defaults to stable version, fails fast on errors)
export class PromptLoader {
  private static PROMPTS_DIR = path.join(__dirname, '..', '..', 'config', 'framework', 'prompts');

  private static loadManifest(promptType: string): PromptManifest {
    const filePath = path.join(this.PROMPTS_DIR, `${promptType}.yaml`);

    if (!fs.existsSync(filePath)) {
      throw new Error(
        `Prompt configuration not found: ${filePath}\n` + `Expected prompt type: ${promptType}`
      );
    }

    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const manifest = yaml.load(fileContent) as PromptManifest;

      // Validate manifest structure
      if (!manifest.metadata || !manifest.metadata.currentVersion) {
        throw new Error(`Invalid prompt manifest: missing metadata.currentVersion in ${filePath}`);
      }

      if (!manifest.versions || Object.keys(manifest.versions).length === 0) {
        throw new Error(`Invalid prompt manifest: no versions defined in ${filePath}`);
      }

      Logger.info(
        `[PromptLoader] Loaded ${promptType} manifest: ${Object.keys(manifest.versions).length} versions available`
      );

      return manifest;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid prompt manifest')) {
        throw error;
      }
      throw new Error(`Failed to parse prompt configuration: ${filePath}\n${error}`);
    }
  }

  // Build judge prompt from YAML sections (replaces variables, skips sections with missing data)
  static buildJudgePrompt(
    variables: Record<string, string>,
    templateName: string = 'llm-as-judge',
    version?: string
  ): string {
    const manifest = this.loadManifest(templateName);
    const versionKey = version || manifest.metadata.currentVersion;
    const promptVersion = manifest.versions[versionKey];

    if (!promptVersion) {
      throw new Error(`Version ${versionKey} not found in ${templateName} manifest`);
    }

    if (!promptVersion.promptStructure || !promptVersion.reusableTextBlocks) {
      throw new Error(
        `Version ${versionKey} does not support sectional composition. ` +
          'Missing promptStructure or reusableTextBlocks.'
      );
    }

    return this.assemblePromptFromSections(
      promptVersion.promptStructure,
      promptVersion.reusableTextBlocks,
      variables
    );
  }

  // Assemble prompt with iterative variable replacement (supports nested variables)
  private static assemblePromptFromSections(
    structure: PromptSection[],
    blocks: Record<string, string>,
    variables: Record<string, string>
  ): string {
    const parts: string[] = [];

    for (const section of structure) {
      // Each section is { sectionId: "content with {variables}" }
      const [sectionId, sectionTemplate] = Object.entries(section)[0];

      // Skip null templates (conditional sections - handled by caller providing empty string)
      if (sectionTemplate === null || sectionTemplate === undefined) {
        continue;
      }

      // Check if this is a conditional section that should be omitted
      // If the section references a variable that is empty/undefined, skip it
      const referencedVars = this.extractVariableNames(sectionTemplate);
      const shouldOmit = referencedVars.some(varName => {
        const value = variables[varName] || blocks[varName];
        return value === undefined || value === null || value === '';
      });

      if (shouldOmit) {
        Logger.info(
          `[PromptLoader] Omitting section '${sectionId}' - conditional variable is empty`
        );
        continue;
      }

      // ITERATIVE VARIABLE REPLACEMENT (supports nested variables)
      // Combine runtime variables and reusable blocks into single replacement map
      const allReplacements = { ...variables, ...blocks };
      let rendered = sectionTemplate;
      const maxIterations = 10;
      let iteration = 0;

      while (iteration < maxIterations) {
        let replacementMade = false;

        // Attempt to replace all variables in current iteration
        for (const [varName, varValue] of Object.entries(allReplacements)) {
          const pattern = new RegExp(`\\{${varName}\\}`, 'g');
          const before = rendered;
          rendered = rendered.replace(pattern, varValue);

          if (before !== rendered) {
            replacementMade = true;
          }
        }

        iteration++;

        // Exit loop if no replacements were made (all variables resolved)
        if (!replacementMade) {
          break;
        }
      }

      // Warn if max iterations reached (possible circular reference)
      if (iteration >= maxIterations) {
        Logger.warn(
          `[PromptLoader] Max iterations (${maxIterations}) reached for section '${sectionId}' - ` +
            'possible circular variable references or deeply nested variables'
        );
      }

      parts.push(rendered);
    }

    return parts.join('\n\n');
  }

  // Extract variable names from template (e.g. "TASK: {taskPrompt}" -> ["taskPrompt"])
  private static extractVariableNames(template: string): string[] {
    const matches = template.match(/\{([^}]+)\}/g);
    if (!matches) return [];
    return matches.map(match => match.slice(1, -1)); // Remove { and }
  }

  // Load judge output schema (actual schema is dynamically generated per test based on quality attributes)
  static loadJudgeSchema(): any | undefined {
    // Use agent template as default since both templates have identical schemas
    const manifest = this.loadManifest('llm-as-judge-agent');
    return manifest.outputSchema;
  }

  static buildUserSimulatorPrompt(variables: Record<string, string>, version?: string): string {
    const manifest = this.loadManifest('user-simulator');
    const versionKey = version || manifest.metadata.currentVersion;
    const promptVersion = manifest.versions[versionKey];

    if (!promptVersion) {
      throw new Error(`Version ${versionKey} not found in user-simulator manifest`);
    }

    if (!promptVersion.promptStructure || !promptVersion.reusableTextBlocks) {
      throw new Error(
        `Version ${versionKey} does not support sectional composition. ` +
          'Missing promptStructure or reusableTextBlocks.'
      );
    }

    return this.assemblePromptFromSections(
      promptVersion.promptStructure,
      promptVersion.reusableTextBlocks,
      variables
    );
  }

  static getAvailableVersions(promptType: string): {
    current: string;
    versions: Array<{ version: string; metadata: PromptVersionMetadata }>;
  } {
    const manifest = this.loadManifest(promptType);

    return {
      current: manifest.metadata.currentVersion,
      versions: Object.entries(manifest.versions).map(([version, data]) => ({
        version,
        metadata: data.metadata,
      })),
    };
  }
}
