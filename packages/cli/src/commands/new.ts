/**
 * New Command
 *
 * Creates a new AI test project with scaffolding.
 *
 * Usage:
 *   ai-test-harness new my-llm-tests
 *   ai-test-harness new my-llm-tests --template=minimal
 *   ai-test-harness new my-llm-tests --type=agent-simulation
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

import { ProjectGenerator, ProjectConfig, NewCommandOptions } from '../generators';

export async function newCommand(projectName: string, options: NewCommandOptions): Promise<void> {
  console.log(chalk.bold('\n🚀 AI Test Harness - Create New Project\n'));

  // Validate project name
  if (!/^[a-z][a-z0-9-]*$/.test(projectName)) {
    console.error(chalk.red('Error: Project name must be kebab-case (e.g., "my-llm-tests")'));
    process.exit(1);
  }

  const targetDir = path.resolve(process.cwd(), projectName);

  // Check if directory exists
  if (fs.existsSync(targetDir)) {
    console.error(chalk.red(`Error: Directory "${projectName}" already exists`));
    process.exit(1);
  }

  // Gather configuration
  const config = await gatherConfig(projectName, options);

  // Create project
  const spinner = ora('Creating project...').start();

  try {
    const generator = new ProjectGenerator(targetDir, config);
    await generator.create();
    spinner.succeed('Project created successfully!');

    // Print next steps
    printNextSteps(projectName, config);
  } catch (error) {
    spinner.fail('Failed to create project');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

async function gatherConfig(projectName: string, options: NewCommandOptions): Promise<ProjectConfig> {
  if (options.yes) {
    const isAgentType = options.type === 'agent-scenario' || options.type === 'agent-simulation';
    return {
      projectName,
      description: `AI quality tests for ${projectName}`,
      testType: options.type,
      modelId: 'us.amazon.nova-micro-v1:0',
      judgeModelId: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      agentModelId: isAgentType ? 'us.anthropic.claude-3-7-sonnet-20250219-v1:0' : '',
    };
  }

  // First, get test type to determine which prompts to show
  const typeAnswer = await inquirer.prompt([
    {
      type: 'input',
      name: 'description',
      message: 'Project description:',
      default: `AI quality tests for ${projectName}`,
    },
    {
      type: 'list',
      name: 'testType',
      message: 'Test type:',
      choices: [
        { name: 'Text Generation (LLM prompt-based)', value: 'text-generation' },
        { name: 'Agent Scenario (Conversational testing)', value: 'agent-scenario' },
        { name: 'Agent Simulation (Dynamic LLM-to-Agent)', value: 'agent-simulation' },
      ],
      default: options.type,
    },
  ]);

  const isAgentType = typeAnswer.testType === 'agent-scenario' || typeAnswer.testType === 'agent-simulation';

  // Build prompts based on test type
  const modelPrompts: any[] = [];

  if (isAgentType) {
    modelPrompts.push({
      type: 'input',
      name: 'agentModelId',
      message: 'Bedrock Agent model ID:',
      default: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
    });
    modelPrompts.push({
      type: 'input',
      name: 'modelId',
      message: 'User Simulator model ID:',
      default: 'us.amazon.nova-micro-v1:0',
    });
  } else {
    modelPrompts.push({
      type: 'input',
      name: 'modelId',
      message: 'LLM model ID:',
      default: 'us.amazon.nova-micro-v1:0',
    });
  }

  modelPrompts.push({
    type: 'input',
    name: 'judgeModelId',
    message: 'Judge model ID:',
    default: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  });

  const modelAnswers = await inquirer.prompt(modelPrompts);

  return {
    projectName,
    ...typeAnswer,
    ...modelAnswers,
    agentModelId: modelAnswers.agentModelId || '',
  };
}

function printNextSteps(projectName: string, config: ProjectConfig): void {
  console.log(chalk.bold('\n📁 Project structure:\n'));
  ProjectGenerator.printStructure(projectName, config.testType);

  console.log(chalk.bold('\n📋 Next steps:\n'));
  console.log(`  1. ${chalk.cyan(`cd ${projectName}`)}`);
  console.log(`  2. ${chalk.cyan('npm install')}`);
  console.log(`  3. ${chalk.cyan('npm test')} to run tests\n`);
  console.log(chalk.dim('  (Project includes sample data - ready to run!)\n'));

  if (config.testType === 'agent-scenario' || config.testType === 'agent-simulation') {
    console.log(chalk.bold('  🚀 To deploy the Bedrock Agent:\n'));
    console.log(`  1. ${chalk.cyan(`cd ${projectName}/deploy`)}`);
    console.log(`  2. ${chalk.cyan('npm install')}`);
    console.log(`  3. ${chalk.cyan('AWS_DEFAULT_REGION=us-east-2 npx cdk bootstrap')} (first time only)`);
    console.log(`  4. ${chalk.cyan('AWS_DEFAULT_REGION=us-east-2 npx cdk deploy')}`);
    console.log(`  5. Update config/shared/agents.yaml with output values\n`);
    console.log(chalk.dim('  See deploy/README.md for detailed instructions\n'));
  }
}
