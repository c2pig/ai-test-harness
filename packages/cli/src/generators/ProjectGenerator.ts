/**
 * ProjectGenerator
 *
 * Orchestrates the creation of new AI test projects.
 * Uses template modules for content generation.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';

import { ProjectConfig } from './types';
import {
  // Base templates
  generatePackageJson,
  generateConfigYaml,
  generateGitignore,
  generateTsConfig,
  generateReadme,
  // Shared config templates
  generatePromptsYaml,
  generateConnectorsYaml,
  generateAgentsYaml,
  generatePricingYaml,
  // Data templates
  generatePromptFile,
  generateSampleData,
  // Calibration templates
  generateCalibrationYaml,
  // Custom quality templates
  generateExampleQuality,
  // Scenario templates
  generateScenarioYaml,
  // Deploy templates
  generateCdkAppTs,
  generateHelpdeskAgentStackTs,
  generateLambdaHandler,
  generateDeployReadme,
  generateDeployPackageJson,
  generateDeployTsConfig,
  generateCdkJson,
} from '../templates';

export class ProjectGenerator {
  private targetDir: string;
  private config: ProjectConfig;

  constructor(targetDir: string, config: ProjectConfig) {
    this.targetDir = targetDir;
    this.config = config;
  }

  /**
   * Create the complete project structure
   */
  async create(): Promise<void> {
    await this.createDirectories();
    await this.createBaseFiles();
    await this.createSharedConfig();
    await this.createDataFiles();
    await this.createCalibrationFiles();
    await this.createCustomQualities();

    if (this.isAgentType()) {
      await this.createScenarios();
      await this.createDeployFolder();
    }
  }

  private isAgentType(): boolean {
    return this.config.testType === 'agent-scenario' || this.config.testType === 'agent-simulation';
  }

  private async createDirectories(): Promise<void> {
    await fs.ensureDir(this.targetDir);
    await fs.ensureDir(path.join(this.targetDir, 'config', 'shared'));
    await fs.ensureDir(path.join(this.targetDir, 'custom', 'qualities'));
    await fs.ensureDir(path.join(this.targetDir, 'data'));
    await fs.ensureDir(path.join(this.targetDir, 'calibration'));
    await fs.ensureDir(path.join(this.targetDir, 'outputs'));

    if (this.isAgentType()) {
      await fs.ensureDir(path.join(this.targetDir, 'scenarios'));
      await fs.ensureDir(path.join(this.targetDir, 'deploy', 'lib'));
      await fs.ensureDir(path.join(this.targetDir, 'deploy', 'lambda'));
      await fs.ensureDir(path.join(this.targetDir, 'deploy', 'bin'));
    }
  }

  private async createBaseFiles(): Promise<void> {
    // package.json
    await fs.writeJson(
      path.join(this.targetDir, 'package.json'),
      generatePackageJson(this.config),
      { spaces: 2 }
    );

    // config.yaml
    await fs.writeFile(
      path.join(this.targetDir, 'config.yaml'),
      generateConfigYaml(this.config)
    );

    // tsconfig.json
    await fs.writeJson(
      path.join(this.targetDir, 'tsconfig.json'),
      generateTsConfig(),
      { spaces: 2 }
    );

    // .gitignore
    await fs.writeFile(
      path.join(this.targetDir, '.gitignore'),
      generateGitignore()
    );

    // README.md
    await fs.writeFile(
      path.join(this.targetDir, 'README.md'),
      generateReadme(this.config)
    );
  }

  private async createSharedConfig(): Promise<void> {
    const sharedDir = path.join(this.targetDir, 'config', 'shared');

    await fs.writeFile(
      path.join(sharedDir, 'prompts.yaml'),
      generatePromptsYaml(this.config)
    );

    await fs.writeFile(
      path.join(sharedDir, 'connectors.yaml'),
      generateConnectorsYaml()
    );

    await fs.writeFile(
      path.join(sharedDir, 'agents.yaml'),
      generateAgentsYaml()
    );

    await fs.writeFile(
      path.join(sharedDir, 'pricing.yaml'),
      generatePricingYaml()
    );
  }

  private async createDataFiles(): Promise<void> {
    await fs.writeFile(
      path.join(this.targetDir, 'data', 'prompt.txt'),
      generatePromptFile()
    );

    await fs.writeJson(
      path.join(this.targetDir, 'data', 'sample-data.json'),
      generateSampleData(),
      { spaces: 2 }
    );
  }

  private async createCalibrationFiles(): Promise<void> {
    await fs.writeFile(
      path.join(this.targetDir, 'calibration', 'examples.yaml'),
      generateCalibrationYaml(this.config)
    );
  }

  private async createCustomQualities(): Promise<void> {
    await fs.writeFile(
      path.join(this.targetDir, 'custom', 'qualities', 'ResponseClarity.ts'),
      generateExampleQuality()
    );
  }

  private async createScenarios(): Promise<void> {
    await fs.writeFile(
      path.join(this.targetDir, 'scenarios', 'example-scenario.yaml'),
      generateScenarioYaml(this.config)
    );
  }

  private async createDeployFolder(): Promise<void> {
    const deployDir = path.join(this.targetDir, 'deploy');

    // package.json
    await fs.writeJson(
      path.join(deployDir, 'package.json'),
      generateDeployPackageJson(this.config),
      { spaces: 2 }
    );

    // tsconfig.json
    await fs.writeJson(
      path.join(deployDir, 'tsconfig.json'),
      generateDeployTsConfig(),
      { spaces: 2 }
    );

    // cdk.json
    await fs.writeJson(
      path.join(deployDir, 'cdk.json'),
      generateCdkJson(),
      { spaces: 2 }
    );

    // bin/app.ts
    await fs.writeFile(
      path.join(deployDir, 'bin', 'app.ts'),
      generateCdkAppTs(this.config)
    );

    // lib/helpdesk-agent-stack.ts
    await fs.writeFile(
      path.join(deployDir, 'lib', 'helpdesk-agent-stack.ts'),
      generateHelpdeskAgentStackTs(this.config)
    );

    // lambda/index.js
    await fs.writeFile(
      path.join(deployDir, 'lambda', 'index.js'),
      generateLambdaHandler(this.config)
    );

    // README.md
    await fs.writeFile(
      path.join(deployDir, 'README.md'),
      generateDeployReadme(this.config)
    );
  }

  /**
   * Print the project structure
   */
  static printStructure(projectName: string, testType: string): void {
    console.log(`  ${projectName}/`);
    console.log(`  ├── config.yaml`);
    console.log(`  ├── config/shared/`);
    console.log(`  │   ├── prompts.yaml`);
    console.log(`  │   ├── connectors.yaml`);
    console.log(`  │   └── pricing.yaml`);
    console.log(`  ├── custom/qualities/`);
    console.log(`  │   └── ResponseClarity.ts`);
    console.log(`  ├── data/`);
    console.log(`  │   ├── sample-data.json`);
    console.log(`  │   └── prompt.txt`);
    console.log(`  ├── calibration/`);
    console.log(`  │   └── examples.yaml`);

    if (testType === 'agent-scenario' || testType === 'agent-simulation') {
      console.log(`  ├── scenarios/`);
      console.log(`  │   └── example-scenario.yaml`);
      console.log(`  ├── deploy/              ${chalk.cyan('← CDK infrastructure')}`);
      console.log(`  │   ├── bin/app.ts`);
      console.log(`  │   ├── lib/helpdesk-agent-stack.ts`);
      console.log(`  │   ├── lambda/index.js`);
      console.log(`  │   └── README.md        ${chalk.cyan('← Deployment guide')}`);
    }

    console.log(`  ├── outputs/             (gitignored)`);
    console.log(`  ├── package.json`);
    console.log(`  ├── tsconfig.json`);
    console.log(`  └── README.md`);
  }
}

