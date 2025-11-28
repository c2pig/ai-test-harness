import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { Logger } from '../utils/logger';

export interface ModelConfig {
  name?: string;
  type: 'bedrock-agent' | 'prompt' | 'bedrock-model';

  // Bedrock Agent fields
  agentId?: string;
  agentAliasId?: string;
  region?: string;

  // Prompt fields
  basePath?: string;
  promptPath?: string;
  inputKeys?: string[];

  // Bedrock Model fields
  modelId?: string;
}

// Load and manage execution models from config/shared/*.yaml
export class ModelFactory {
  private models: Map<string, ModelConfig> = new Map();

  constructor(configPath: string = './config/shared/models.yaml') {
    this.loadModels(configPath);
  }

  private loadModels(configPath: string): void {
    const configDir = configPath.replace(/models\.yaml$/, '');
    const agentsPath = `${configDir}agents.yaml`;
    const promptsPath = `${configDir}prompts.yaml`;

    // Load from split configuration files
    if (!fs.existsSync(agentsPath) || !fs.existsSync(promptsPath)) {
      Logger.warn(`Model config files not found. Expected: ${agentsPath} and ${promptsPath}`);
      return;
    }

    Logger.info(`Loading models from split configuration files`);

    const agentsLoaded = this.loadModelsFromFile(agentsPath, 'agents');
    const promptsLoaded = this.loadModelsFromFile(promptsPath, 'prompts');

    const totalLoaded = agentsLoaded + promptsLoaded;
    Logger.info(
      `Loaded ${totalLoaded} model configurations (${agentsLoaded} agents, ${promptsLoaded} prompts)`
    );
  }

  private loadModelsFromFile(filePath: string, fileType: string): number {
    if (!fs.existsSync(filePath)) {
      Logger.warn(`${fileType} config not found: ${filePath}`);
      return 0;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const config = yaml.load(content) as { models: Record<string, ModelConfig> };

    if (!config.models) {
      Logger.warn(`No models section found in ${filePath}`);
      return 0;
    }

    Object.entries(config.models).forEach(([name, modelConfig]) => {
      this.models.set(name, { ...modelConfig, name });
    });

    return Object.keys(config.models).length;
  }

  /**
   * Get model configuration by name
   */
  getModelConfig(name: string): ModelConfig | undefined {
    return this.models.get(name);
  }

  /**
   * Validate that a model exists and matches expected type
   */
  validateModel(name: string, expectedType?: string): void {
    const model = this.models.get(name);

    if (!model) {
      throw new Error(
        `Model not found: ${name}. Available models: ${Array.from(this.models.keys()).join(', ')}`
      );
    }

    if (expectedType && model.type !== expectedType) {
      throw new Error(`Model '${name}' has type '${model.type}' but expected '${expectedType}'`);
    }
  }

  /**
   * Get all model names by type
   */
  getModelsByType(type: ModelConfig['type']): string[] {
    return Array.from(this.models.entries())
      .filter(([_, config]) => config.type === type)
      .map(([name]) => name);
  }
}
