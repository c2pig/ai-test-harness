import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { Logger } from './logger';
import { ModelFactory } from '../models/ModelFactory';
import { createValidators } from '../validators';
import {
  validateTenantConfig,
  validateScenario,
  validateCalibration,
  type LoadedTenantConfig,
} from '../schemas';

export class ConfigLoader {
  static async load(configPath: string): Promise<LoadedTenantConfig> {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }

    const baseDir = path.dirname(configPath);

    // Validate config with Zod schema
    Logger.debug(`[ConfigLoader] Validating config with Zod schema`);
    const validationResult = validateTenantConfig(configPath);

    if (!validationResult.valid) {
      const errors =
        validationResult.errors
          ?.map(err => `  [${err.path}]: ${err.message}${err.expected ? ` (${err.expected})` : ''}`)
          .join('\n') || 'Unknown validation error';

      throw new Error(
        `Config validation failed for ${configPath}:\n${errors}\n\n` +
          `See docs/config-schema.md for schema documentation.`
      );
    }

    Logger.debug(
      `[ConfigLoader] ✓ Config validated successfully (schema: ${validationResult.data.schemaVersion})`
    );
    const config = validationResult.data as any; // Cast to any for legacy compatibility during transition

    if (config.testPlan?.type === 'agent-scenario') {
      await this.loadAgentConversationExtensions(config, baseDir);
    }

    if (config.testPlan?.type === 'agent-simulation') {
      await this.loadAgentConversationExtensions(config, baseDir);
    }

    if (config.testPlan?.type === 'conversation-evaluation') {
      await this.loadAgentReplayExtensions(config, baseDir);
    }

    if (config.testPlan?.type === 'agent-rerun') {
      await this.loadAgentReinvokeExtensions(config, baseDir);
    }

    if (config.testPlan?.type === 'text-generation') {
      await this.loadTextGenerationExtensions(config, baseDir);
    }

    if (config.evaluationPlan?.qualityAssessment?.calibrationPath) {
      await this.loadCalibrationExtension(config, baseDir);
    }

    // Parse validators if present
    if (config.validators) {
      this.parseValidators(config);
    }

    return config;
  }

  private static async loadAgentConversationExtensions(
    config: any,
    baseDir: string
  ): Promise<void> {
    // Resolve agent from testPlan.agent (string reference)
    const agentRef = config.testPlan.agent;
    if (agentRef && typeof agentRef === 'string') {
      await this.resolveModel(config, baseDir, 'agent-scenario', {
        type: 'bedrock-agent',
        name: agentRef,
      });
    }

    const scenariosPath = config.testPlan.scenariosPath;

    if (!scenariosPath) {
      Logger.debug('[ConfigLoader] No scenariosPath specified, using inline scenarios');
      return;
    }

    const resolvedPath = path.resolve(baseDir, scenariosPath);
    Logger.debug(`[ConfigLoader] Loading scenarios from: ${scenariosPath}`);

    const scenarioFiles = await glob(resolvedPath, { nodir: true });

    if (scenarioFiles.length === 0) {
      Logger.warn(`[ConfigLoader] No scenario files found matching pattern: ${scenariosPath}`);
      return;
    }

    const scenarios: any[] = [];

    for (const file of scenarioFiles) {
      try {
        // Validate scenario with Zod schema
        const validationResult = validateScenario(file);

        if (!validationResult.valid) {
          const errors =
            validationResult.errors?.map(err => `[${err.path}]: ${err.message}`).join(', ') ||
            'Unknown error';
          Logger.warn(
            `[ConfigLoader]   ✗ Scenario validation failed for ${path.basename(file)}: ${errors}`
          );
          continue;
        }

        const scenario = validationResult.data;
        scenarios.push(scenario);
        Logger.debug(
          `[ConfigLoader]   ✓ Loaded scenario: ${scenario.scenarioId} from ${path.basename(file)}`
        );
      } catch (error) {
        Logger.warn(`[ConfigLoader]   ✗ Failed to load scenario from ${file}`, error);
      }
    }

    // Inject into test plan
    config.testPlan.scenarios = scenarios;
    Logger.debug(
      `[ConfigLoader] ✓ Loaded ${scenarios.length} scenarios from ${scenarioFiles.length} files`
    );
  }

  private static async loadAgentReplayExtensions(config: any, baseDir: string): Promise<void> {
    // Resolve agent from testPlan.agent (string reference)
    const agentRef = config.testPlan.agent;
    if (agentRef && typeof agentRef === 'string') {
      await this.resolveModel(config, baseDir, 'conversation-evaluation', {
        type: 'bedrock-agent',
        name: agentRef,
      });
    }
  }

  private static async loadAgentReinvokeExtensions(config: any, baseDir: string): Promise<void> {
    // Resolve agent from testPlan.agent (string reference)
    const agentRef = config.testPlan.agent;
    if (agentRef && typeof agentRef === 'string') {
      await this.resolveModel(config, baseDir, 'agent-rerun', {
        type: 'bedrock-agent',
        name: agentRef,
      });
    }
  }

  private static async loadTextGenerationExtensions(config: any, baseDir: string): Promise<void> {
    const promptRef = config.testPlan.prompt;
    if (promptRef && typeof promptRef === 'string') {
      await this.resolveModel(config, baseDir, 'text-generation', {
        type: 'prompt',
        name: promptRef,
      });
    }
  }

  private static async loadCalibrationExtension(config: any, baseDir: string): Promise<void> {
    const calibrationPath = config.evaluationPlan.qualityAssessment.calibrationPath;
    const resolvedPath = path.resolve(baseDir, calibrationPath);

    if (!fs.existsSync(resolvedPath)) {
      Logger.warn(`[ConfigLoader] Calibration file not found: ${calibrationPath}`);
      return;
    }

    Logger.debug(`[ConfigLoader] Loading calibration from: ${calibrationPath}`);

    try {
      // Validate calibration with Zod schema
      const validationResult = validateCalibration(resolvedPath);

      if (!validationResult.valid) {
        const errors =
          validationResult.errors?.map(err => `[${err.path}]: ${err.message}`).join(', ') ||
          'Unknown error';
        Logger.warn(`[ConfigLoader] Calibration validation failed: ${errors}`);
        return;
      }

      const calibration = validationResult.data;
      config.evaluationPlan.qualityAssessment.calibration = calibration;
      Logger.debug(
        `[ConfigLoader] ✓ Loaded calibration with ${calibration.examples.length} examples (enabled: ${calibration.enabled})`
      );
    } catch (error) {
      Logger.warn(`[ConfigLoader] Failed to load calibration from ${calibrationPath}`, error);
    }
  }

  /**
   * NEW MODEL RESOLUTION - Supports unified model pattern across all test types
   */
  private static async resolveModel(
    config: any,
    baseDir: string,
    testType: 'agent-scenario' | 'conversation-evaluation' | 'agent-rerun' | 'text-generation',
    modelRef: { type: string; name: string }
  ): Promise<void> {
    // Find project root by looking for package.json
    // Convert baseDir to absolute path first
    let currentDir = path.resolve(baseDir);
    let projectRoot = '';

    while (currentDir !== path.dirname(currentDir)) {
      if (fs.existsSync(path.join(currentDir, 'package.json'))) {
        projectRoot = currentDir;
        break;
      }
      currentDir = path.dirname(currentDir);
    }

    if (!projectRoot) {
      throw new Error(`Could not find project root (package.json) from ${baseDir}`);
    }

    const modelsConfigDir = path.join(projectRoot, 'config', 'shared');

    Logger.debug(
      `[ConfigLoader] Loading model '${modelRef.name}' (type: ${modelRef.type}) from shared models`
    );

    const modelFactory = new ModelFactory(`${modelsConfigDir}/models.yaml`);
    const modelConfig = modelFactory.getModelConfig(modelRef.name);

    if (!modelConfig) {
      throw new Error(
        `Model '${modelRef.name}' not found in ${modelsConfigDir}. ` +
          `Available models: ${Array.from(modelFactory.getModelsByType(modelRef.type as any)).join(', ')}`
      );
    }

    // Validate model type matches expected type
    // Only text-generation uses 'prompt' models, all agent-related tests use 'bedrock-agent'
    const expectedModelType = testType === 'text-generation' ? 'prompt' : 'bedrock-agent';
    if (modelConfig.type !== expectedModelType) {
      throw new Error(
        `Model '${modelRef.name}' has type '${modelConfig.type}' but expected '${expectedModelType}' for ${testType}`
      );
    }

    // Inject resolved model into config based on test type
    if (
      testType === 'agent-scenario' ||
      testType === 'conversation-evaluation' ||
      testType === 'agent-rerun'
    ) {
      config.testPlan.agentConfig = {
        type: modelConfig.type,
        agentId: modelConfig.agentId,
        agentAliasId: modelConfig.agentAliasId,
        region: modelConfig.region,
      };
    } else if (testType === 'text-generation') {
      config.testPlan.promptConfig = {
        type: modelConfig.type,
        basePath: modelConfig.basePath,
        promptPath: modelConfig.promptPath,
        inputKeys: modelConfig.inputKeys,
      };
    }

    Logger.info(`[ConfigLoader] ✓ Resolved model: ${modelRef.name}`);
  }

  /**
   * Parse validators from configuration and create validator instances
   */
  private static parseValidators(config: any): void {
    Logger.debug(`[ConfigLoader] Parsing validators`);

    try {
      const validatorInstances = createValidators(config.validators);
      config.validatorInstances = validatorInstances;
      Logger.info(`[ConfigLoader] ✓ Created ${validatorInstances.length} validator(s)`);
    } catch (error) {
      Logger.warn(`[ConfigLoader] Failed to parse validators`, error);
    }
  }
}
