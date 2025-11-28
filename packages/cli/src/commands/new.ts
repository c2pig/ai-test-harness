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
import Handlebars from 'handlebars';

interface NewCommandOptions {
  template: string;
  type: string;
  yes: boolean;
}

interface ProjectConfig {
  projectName: string;
  description: string;
  testType: string;
  modelId: string;
  judgeModelId: string;
}

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
  let config: ProjectConfig;

  if (options.yes) {
    config = {
      projectName,
      description: `AI quality tests for ${projectName}`,
      testType: options.type,
      modelId: 'us.amazon.nova-micro-v1:0',
      judgeModelId: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    };
  } else {
    const answers = await inquirer.prompt([
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
      {
        type: 'input',
        name: 'modelId',
        message: 'Default model ID:',
        default: 'us.amazon.nova-micro-v1:0',
      },
      {
        type: 'input',
        name: 'judgeModelId',
        message: 'Judge model ID:',
        default: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      },
    ]);

    config = {
      projectName,
      ...answers,
    };
  }

  // Create project
  const spinner = ora('Creating project...').start();

  try {
    await createProject(targetDir, config, options.template);
    spinner.succeed('Project created successfully!');

    // Print next steps
    console.log(chalk.bold('\n📁 Project structure:\n'));
    printProjectStructure(projectName, config.testType);

    console.log(chalk.bold('\n📋 Next steps:\n'));
    console.log(`  1. ${chalk.cyan(`cd ${projectName}`)}`);
    console.log(`  2. ${chalk.cyan('npm install')}`);
    console.log(`  3. ${chalk.cyan('npm test')} to run tests\n`);
    console.log(chalk.dim('  (Project includes sample data - ready to run!)\n'));

    if (config.testType === 'agent-scenario' || config.testType === 'agent-simulation') {
      console.log(chalk.bold('  🚀 To deploy the Bedrock Agent:\n'));
      console.log(`  1. ${chalk.cyan(`cd ${projectName}/deploy`)}`);
      console.log(`  2. ${chalk.cyan('npm install')}`);
      console.log(`  3. ${chalk.cyan('npx cdk bootstrap')} (first time only)`);
      console.log(`  4. ${chalk.cyan('npx cdk deploy')}`);
      console.log(`  5. Update config/shared/agents.yaml with output values\n`);
      console.log(chalk.dim('  See deploy/README.md for detailed instructions\n'));
    }

  } catch (error) {
    spinner.fail('Failed to create project');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

async function createProject(
  targetDir: string,
  config: ProjectConfig,
  template: string
): Promise<void> {
  // Create directory structure
  await fs.ensureDir(targetDir);
  await fs.ensureDir(path.join(targetDir, 'config', 'shared'));
  await fs.ensureDir(path.join(targetDir, 'custom', 'qualities'));
  await fs.ensureDir(path.join(targetDir, 'data'));
  await fs.ensureDir(path.join(targetDir, 'calibration'));
  await fs.ensureDir(path.join(targetDir, 'outputs'));

  if (config.testType === 'agent-scenario' || config.testType === 'agent-simulation') {
    await fs.ensureDir(path.join(targetDir, 'scenarios'));
    await fs.ensureDir(path.join(targetDir, 'deploy', 'lib'));
    await fs.ensureDir(path.join(targetDir, 'deploy', 'lambda'));
    await fs.ensureDir(path.join(targetDir, 'deploy', 'bin'));
  }

  // Create package.json
  await fs.writeJson(
    path.join(targetDir, 'package.json'),
    generatePackageJson(config),
    { spaces: 2 }
  );

  // Create config.yaml
  await fs.writeFile(
    path.join(targetDir, 'config.yaml'),
    generateConfigYaml(config)
  );

  // Create config/shared/prompts.yaml (required by framework)
  await fs.writeFile(
    path.join(targetDir, 'config', 'shared', 'prompts.yaml'),
    generatePromptsYaml(config)
  );

  // Create config/shared/connectors.yaml (required by framework)
  await fs.writeFile(
    path.join(targetDir, 'config', 'shared', 'connectors.yaml'),
    generateConnectorsYaml()
  );

  // Create config/shared/agents.yaml (required by framework)
  await fs.writeFile(
    path.join(targetDir, 'config', 'shared', 'agents.yaml'),
    generateAgentsYaml()
  );

  // Create config/shared/pricing.yaml
  await fs.writeFile(
    path.join(targetDir, 'config', 'shared', 'pricing.yaml'),
    generatePricingYaml()
  );

  // Create the prompt file
  await fs.writeFile(
    path.join(targetDir, 'data', 'prompt.txt'),
    generatePromptFile()
  );

  // Create example quality attribute
  await fs.writeFile(
    path.join(targetDir, 'custom', 'qualities', 'ExampleQuality.ts'),
    generateExampleQuality()
  );

  // Create calibration examples
  await fs.writeFile(
    path.join(targetDir, 'calibration', 'examples.yaml'),
    generateCalibrationYaml(config)
  );

  // Create sample data
  await fs.writeJson(
    path.join(targetDir, 'data', 'sample-data.json'),
    generateSampleData(),
    { spaces: 2 }
  );

  // Create scenario and deploy folder if agent type
  if (config.testType === 'agent-scenario' || config.testType === 'agent-simulation') {
    await fs.writeFile(
      path.join(targetDir, 'scenarios', 'example-scenario.yaml'),
      generateScenarioYaml(config)
    );
    // Create deploy folder with CDK infrastructure
    await createDeployFolder(targetDir, config);
  }

  // Create tsconfig.json for custom qualities
  await fs.writeJson(
    path.join(targetDir, 'tsconfig.json'),
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        outDir: './dist',
        rootDir: './custom',
      },
      include: ['custom/**/*'],
    },
    { spaces: 2 }
  );

  // Create .gitignore
  await fs.writeFile(
    path.join(targetDir, '.gitignore'),
    `# Dependencies
node_modules/

# Build output
dist/

# Test outputs
outputs/

# Environment
.env
.env.local

# IDE
.vscode/
.idea/

# OS
.DS_Store
`
  );

  // Create README.md
  await fs.writeFile(
    path.join(targetDir, 'README.md'),
    generateReadme(config)
  );
}

function generatePackageJson(config: ProjectConfig): object {
  return {
    name: config.projectName,
    version: '1.0.0',
    description: config.description,
    scripts: {
      test: 'ai-test-harness run',
      'test:verbose': 'ai-test-harness run --verbose',
      validate: 'ai-test-harness validate',
      'schema:version': 'ai-test-harness schema-version',
    },
    dependencies: {
      '@ai-test-harness/core': '^1.0.0',
    },
    devDependencies: {
      '@ai-test-harness/cli': '^1.0.0',
    },
  };
}

function generateConfigYaml(config: ProjectConfig): string {
  if (config.testType === 'agent-simulation') {
    return `# AI Test Harness Configuration
schemaVersion: "1.0.0"

project:
  name: ${config.projectName}
  description: "${config.description}"

testPlan:
  type: agent-simulation
  region: us-east-2
  
  # Configure your Bedrock Agent
  agent: my-agent  # Reference from config/shared/agents.yaml
  batchSize: 3
  
  # User simulator configuration
  userSimulator:
    modelId: ${config.modelId}
    temperature: 0.8
    topP: 1.0
    maxTokens: 500
  
  # Conversation control
  conversationControl:
    maxTurns: 15
  
  # Load scenarios
  scenariosPath: "./scenarios/**/*.yaml"

evaluationPlan:
  region: us-east-2
  judgeModel:
    modelId: ${config.judgeModelId}
    temperature: 0.3
    topP: 1.0

  qualityAssessment:
    attributes:
      - ResponseQuality
      - QuestioningStrategy
      - EvidenceGathering
      # Add your custom attributes from custom/qualities/
      # - custom/qualities/ExampleQuality

    solutionDescription: "${config.description}"
    calibrationPath: "./calibration/examples.yaml"
`;
  }

  return `# AI Test Harness Configuration
schemaVersion: "1.0.0"

project:
  name: ${config.projectName}
  description: "${config.description}"

testPlan:
  type: text-generation
  region: us-east-2
  sampleSize: 3
  batchSize: 1

  # Prompt configuration (defined in config/shared/prompts.yaml)
  prompt: main-prompt

  # Data connector (defined in config/shared/connectors.yaml)
  connectors:
    logs: local-data

  # LLM configuration
  llmConfig:
    - modelId: ${config.modelId}
      temperature: 0.7
      topP: 0.9
      maxTokens: 1000

evaluationPlan:
  region: us-east-2
  judgeModel:
    modelId: ${config.judgeModelId}
    temperature: 0
    topP: 1.0
    maxTokens: 2000

  qualityAssessment:
    attributes:
      - ZeroHallucination
      - CleanOutput
      # Add your custom attributes from custom/qualities/
      # - custom/qualities/ExampleQuality

    solutionDescription: "${config.description}"
    calibrationPath: "./calibration/examples.yaml"
`;
}

function generatePricingYaml(): string {
  return `# Custom Model Pricing (Optional)
# Override or extend default pricing from @ai-test-harness/core
#
# Prices are per 1,000 tokens
# To convert from "per 1M tokens": price_per_1M / 1000

# Example custom model pricing:
# custom.my-model-v1:
#   inputPer1kTokens: 0.001
#   outputPer1kTokens: 0.002
`;
}

function generatePromptsYaml(config: ProjectConfig): string {
  return `# Prompt Definitions
#
# Define your prompts here. Reference them in config.yaml via the prompt name.

models:
  main-prompt:
    type: prompt
    basePath: ./data
    promptPath: prompt.txt
    inputKeys:
      - question
      - context
`;
}

function generatePromptFile(): string {
  return `You are a helpful AI assistant. Answer the following question based on the provided context.

Context: {{context}}

Question: {{question}}

Please provide a clear, accurate, and helpful response.
`;
}

function generateConnectorsYaml(): string {
  return `# Data Connectors
#
# Define data sources for your tests. Reference them in config.yaml.

connectors:
  local-data:
    type: local-file-json
    filePath: ./data/sample-data.json
    recordKey: id  # Unique identifier field for each test record
    outputSchema:
      id: "$.id"
      question: "$.question"
      context: "$.context"
      expectedOutput: "$.expectedOutput"

  # Example: CloudWatch connector
  # cloudwatch-logs:
  #   type: cloudwatch
  #   logGroupName: /aws/lambda/my-function
  #   region: us-east-1
  #   outputSchema:
  #     input: "$.message.input"
  #     output: "$.message.output"
`;
}

function generateAgentsYaml(): string {
  return `# Agent Definitions
#
# Define your Bedrock agents here. Reference them in config.yaml for agent-simulation tests.

models: {}
  # Example agent configuration:
  # my-agent:
  #   type: bedrock-agent
  #   agentId: YOUR_AGENT_ID
  #   agentAliasId: YOUR_AGENT_ALIAS_ID
  #   region: us-east-2
`;
}

function generateExampleQuality(): string {
  return `/**
 * Example Custom Quality Attribute
 *
 * This file demonstrates how to create custom quality attributes.
 * The framework will automatically load .ts files from custom/qualities/
 */

import { QualityAttributeDefinition } from '@ai-test-harness/core';

export const ExampleQuality: QualityAttributeDefinition = {
  name: 'ExampleQuality',
  description: 'Example custom quality attribute for demonstration',
  category: 'custom',

  // Scoring rubric (1-5 scale)
  scoringCriteria: {
    1: 'Very poor - Does not meet any expectations',
    2: 'Poor - Meets few expectations with significant issues',
    3: 'Acceptable - Meets basic expectations with some issues',
    4: 'Good - Meets most expectations with minor issues',
    5: 'Excellent - Exceeds expectations with no issues',
  },

  // Guide for the LLM judge
  evaluationGuidelines: \`
    When evaluating this attribute, consider:
    - Criterion 1: Describe what to look for
    - Criterion 2: Describe what to look for
    - Criterion 3: Describe what to look for

    Score based on how well the output meets these criteria.
  \`,

  // Optional: Input keys required for evaluation
  inputConfig: {
    inputKeys: ['question', 'context', 'generatedOutput'],
    requiredKeys: ['generatedOutput'],
  },

  // Optional: Weight for weighted average calculation
  weight: 1.0,
};

export default ExampleQuality;
`;
}

function generateCalibrationYaml(config: ProjectConfig): string {
  return `# Calibration Examples
#
# These examples help the LLM judge understand quality expectations.
# Add real examples from your domain to improve evaluation accuracy.

enabled: true

examples:
  - category: excellent-example
    description: Example of high-quality output
    guidance: |
      This represents an ideal response that:
      - Contains only accurate, verifiable information
      - Is well-organized with clear structure
      - Directly addresses the question asked
      - Provides complete coverage without unnecessary padding
    expectedRating:
      ZeroHallucination: 5
      CleanOutput: 5

  - category: poor-example
    description: Example of low-quality output
    guidance: |
      This represents a problematic response that:
      - May contain fabricated or inaccurate information
      - Is disorganized or hard to follow
      - Misses key aspects of the question
      - Contains irrelevant or excessive content
    expectedRating:
      ZeroHallucination: 2
      CleanOutput: 2
`;
}

function generateSampleData(): object[] {
  return [
    {
      id: 'test-001',
      question: 'What is the capital of France?',
      context: 'France is a country in Western Europe. Its capital city is known for the Eiffel Tower.',
      expectedOutput: 'Paris',
    },
    {
      id: 'test-002',
      question: 'What is 2 + 2?',
      context: 'Basic arithmetic operations involve addition, subtraction, multiplication, and division.',
      expectedOutput: '4',
    },
    {
      id: 'test-003',
      question: 'Who wrote Romeo and Juliet?',
      context: 'Romeo and Juliet is a famous tragedy written in the late 16th century by an English playwright.',
      expectedOutput: 'William Shakespeare',
    },
  ];
}

function generateScenarioYaml(config: ProjectConfig): string {
  return `# Example Test Scenario
scenarioId: example-scenario
description: Example test scenario for ${config.projectName}

# Conversation examples (style guide, not exact script)
conversationExamples:
  - user: "Hello, I have a question"
  - user: "Can you help me with this?"
  - user: "Thank you for your help"

# User persona (sent to simulator only, not judge)
persona:
  - Curious and engaged
  - Professional communication style
  - Values clear explanations

# Context data (sent to both simulator and judge)
contextData:
  exampleField: "example value"
  anotherField: 123

# Acceptance criteria (evaluated by judge)
acceptanceCriteria:
  - Agent should respond politely
  - Agent should address the question appropriately
  - Agent should provide helpful information
`;
}

async function createDeployFolder(targetDir: string, config: ProjectConfig): Promise<void> {
  const deployDir = path.join(targetDir, 'deploy');

  // Create deploy/package.json
  await fs.writeJson(
    path.join(deployDir, 'package.json'),
    {
      name: `${config.projectName}-deploy`,
      version: '1.0.0',
      scripts: {
        build: 'tsc',
        deploy: 'cdk deploy',
        destroy: 'cdk destroy',
        synth: 'cdk synth',
      },
      dependencies: {
        'aws-cdk-lib': '^2.170.0',
        constructs: '^10.4.2',
        'source-map-support': '^0.5.21',
      },
      devDependencies: {
        'aws-cdk': '^2.170.0',
        typescript: '^5.7.2',
        'ts-node': '^10.9.2',
        '@types/node': '^22.10.0',
      },
    },
    { spaces: 2 }
  );

  // Create deploy/tsconfig.json
  await fs.writeJson(
    path.join(deployDir, 'tsconfig.json'),
    {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        lib: ['ES2020'],
        declaration: true,
        strict: true,
        noImplicitAny: true,
        strictNullChecks: true,
        noImplicitThis: true,
        alwaysStrict: true,
        noUnusedLocals: false,
        noUnusedParameters: false,
        noImplicitReturns: true,
        noFallthroughCasesInSwitch: false,
        inlineSourceMap: true,
        inlineSources: true,
        experimentalDecorators: true,
        strictPropertyInitialization: false,
        outDir: './dist',
        rootDir: '.',
      },
      exclude: ['node_modules', 'cdk.out'],
    },
    { spaces: 2 }
  );

  // Create deploy/cdk.json
  await fs.writeJson(
    path.join(deployDir, 'cdk.json'),
    {
      app: 'npx ts-node --prefer-ts-exts bin/app.ts',
      watch: {
        include: ['**'],
        exclude: [
          'README.md',
          'cdk*.json',
          '**/*.d.ts',
          '**/*.js',
          'tsconfig.json',
          'package*.json',
          'yarn.lock',
          'node_modules',
          'cdk.out',
        ],
      },
      context: {
        '@aws-cdk/aws-lambda:recognizeLayerVersion': true,
        '@aws-cdk/core:checkSecretUsage': true,
        '@aws-cdk/core:target-partitions': ['aws', 'aws-cn'],
      },
    },
    { spaces: 2 }
  );

  // Create deploy/bin/app.ts
  await fs.writeFile(
    path.join(deployDir, 'bin', 'app.ts'),
    generateCdkAppTs(config)
  );

  // Create deploy/lib/helpdesk-agent-stack.ts
  await fs.writeFile(
    path.join(deployDir, 'lib', 'helpdesk-agent-stack.ts'),
    generateHelpdeskAgentStackTs(config)
  );

  // Create deploy/lambda/index.py
  await fs.writeFile(
    path.join(deployDir, 'lambda', 'index.py'),
    generateLambdaHandler(config)
  );

  // Create deploy/README.md
  await fs.writeFile(
    path.join(deployDir, 'README.md'),
    generateDeployReadme(config)
  );
}

function generateCdkAppTs(config: ProjectConfig): string {
  const stackName = config.projectName
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

  return `#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { HelpdeskAgentStack } from '../lib/helpdesk-agent-stack';

const app = new cdk.App();

new HelpdeskAgentStack(app, '${stackName}Stack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-2',
  },
  description: 'Bedrock Agent infrastructure for ${config.projectName}',
});
`;
}

function generateHelpdeskAgentStackTs(config: ProjectConfig): string {
  const stackName = config.projectName
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

  return `import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { Construct } from 'constructs';

export class HelpdeskAgentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lambda execution role
    const lambdaRole = new iam.Role(this, 'ActionLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Lambda function for action group
    const actionHandler = new lambda.Function(this, 'HelpdeskActionHandler', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'),
      timeout: cdk.Duration.seconds(30),
      role: lambdaRole,
      functionName: '${config.projectName}-HelpdeskActionHandler',
    });

    // Bedrock Agent role
    const agentRole = new iam.Role(this, 'BedrockAgentRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      inlinePolicies: {
        BedrockInvoke: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['bedrock:InvokeModel'],
              resources: [
                \`arn:aws:bedrock:\${this.region}::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0\`,
              ],
            }),
          ],
        }),
      },
    });

    // Allow Bedrock to invoke the Lambda
    actionHandler.addPermission('BedrockInvoke', {
      principal: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      sourceArn: \`arn:aws:bedrock:\${this.region}:\${this.account}:agent/*\`,
    });

    // Create the Bedrock Agent
    const agent = new bedrock.CfnAgent(this, 'HelpdeskAgent', {
      agentName: '${config.projectName}-helpdesk',
      agentResourceRoleArn: agentRole.roleArn,
      foundationModel: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
      instruction: \`You are a helpful customer support agent for a helpdesk system.
Your role is to assist customers with their inquiries about orders, account details, and support tickets.

When helping customers:
1. Always verify the customer first using their email or customer ID
2. Be polite, professional, and helpful
3. Provide accurate information based on the available data
4. Create support tickets when issues cannot be resolved immediately

Available actions:
- validateCustomer: Verify a customer exists by email or ID
- getCustomerDetails: Get full customer information
- getOrderStatus: Check the status of an order
- createSupportTicket: Create a new support ticket for unresolved issues\`,
      idleSessionTtlInSeconds: 600,
      actionGroups: [
        {
          actionGroupName: 'HelpdeskActions',
          actionGroupExecutor: {
            lambda: actionHandler.functionArn,
          },
          functionSchema: {
            functions: [
              {
                name: 'validateCustomer',
                description: 'Validates if a customer exists in the system by email or customer ID',
                parameters: {
                  email: {
                    type: 'string',
                    description: 'Customer email address',
                    required: false,
                  },
                  customerId: {
                    type: 'string',
                    description: 'Customer ID (e.g., CUST-12345)',
                    required: false,
                  },
                },
              },
              {
                name: 'getCustomerDetails',
                description: 'Retrieves full customer details including name, email, and account status',
                parameters: {
                  customerId: {
                    type: 'string',
                    description: 'Customer ID (e.g., CUST-12345)',
                    required: true,
                  },
                },
              },
              {
                name: 'getOrderStatus',
                description: 'Gets the current status of an order',
                parameters: {
                  orderId: {
                    type: 'string',
                    description: 'Order ID (e.g., ORD-001)',
                    required: true,
                  },
                },
              },
              {
                name: 'createSupportTicket',
                description: 'Creates a new support ticket for a customer issue',
                parameters: {
                  customerId: {
                    type: 'string',
                    description: 'Customer ID',
                    required: true,
                  },
                  subject: {
                    type: 'string',
                    description: 'Brief subject of the issue',
                    required: true,
                  },
                  description: {
                    type: 'string',
                    description: 'Detailed description of the issue',
                    required: true,
                  },
                  priority: {
                    type: 'string',
                    description: 'Priority level: low, medium, or high',
                    required: false,
                  },
                },
              },
            ],
          },
        },
      ],
    });

    // Create an alias for the agent
    const agentAlias = new bedrock.CfnAgentAlias(this, 'HelpdeskAgentAlias', {
      agentId: agent.attrAgentId,
      agentAliasName: 'live',
    });

    // Outputs
    new cdk.CfnOutput(this, 'AgentId', {
      value: agent.attrAgentId,
      description: 'Bedrock Agent ID',
    });

    new cdk.CfnOutput(this, 'AgentAliasId', {
      value: agentAlias.attrAgentAliasId,
      description: 'Bedrock Agent Alias ID',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: actionHandler.functionName,
      description: 'Lambda function name for action handler',
    });
  }
}
`;
}

function generateLambdaHandler(config: ProjectConfig): string {
  return `"""
Helpdesk Action Handler Lambda

This Lambda handles actions from the Bedrock Agent for the helpdesk chatbot.
All data is mocked for testing purposes.
"""

import json

# Mock customer database
CUSTOMERS = {
    "CUST-12345": {
        "customerId": "CUST-12345",
        "name": "John Smith",
        "email": "john.smith@example.com",
        "accountStatus": "active",
        "memberSince": "2023-01-15",
    },
    "CUST-67890": {
        "customerId": "CUST-67890",
        "name": "Jane Doe",
        "email": "jane.doe@example.com",
        "accountStatus": "active",
        "memberSince": "2023-06-20",
    },
}

# Email to customer ID mapping
EMAIL_TO_ID = {
    "john.smith@example.com": "CUST-12345",
    "jane.doe@example.com": "CUST-67890",
}

# Mock orders database
ORDERS = {
    "ORD-001": {
        "orderId": "ORD-001",
        "customerId": "CUST-12345",
        "status": "Delivered",
        "items": ["Widget A", "Widget B"],
        "total": 150.00,
        "orderDate": "2024-01-10",
        "deliveryDate": "2024-01-15",
    },
    "ORD-002": {
        "orderId": "ORD-002",
        "customerId": "CUST-12345",
        "status": "In Transit",
        "items": ["Gadget X"],
        "total": 75.50,
        "orderDate": "2024-01-18",
        "estimatedDelivery": "2024-01-25",
    },
    "ORD-003": {
        "orderId": "ORD-003",
        "customerId": "CUST-12345",
        "status": "Processing",
        "items": ["Super Widget"],
        "total": 299.99,
        "orderDate": "2024-01-20",
        "estimatedDelivery": "2024-01-28",
    },
}

# Mock ticket counter
ticket_counter = 1000


def handler(event, context):
    """Main Lambda handler for Bedrock Agent actions."""
    print(f"Received event: {json.dumps(event)}")

    # Extract action details from Bedrock Agent event
    action_group = event.get("actionGroup", "")
    function_name = event.get("function", "")
    parameters = event.get("parameters", [])

    # Convert parameters list to dict
    params = {}
    for param in parameters:
        params[param["name"]] = param["value"]

    # Route to appropriate handler
    if function_name == "validateCustomer":
        result = validate_customer(params)
    elif function_name == "getCustomerDetails":
        result = get_customer_details(params)
    elif function_name == "getOrderStatus":
        result = get_order_status(params)
    elif function_name == "createSupportTicket":
        result = create_support_ticket(params)
    else:
        result = {"error": f"Unknown function: {function_name}"}

    # Format response for Bedrock Agent
    response = {
        "messageVersion": "1.0",
        "response": {
            "actionGroup": action_group,
            "function": function_name,
            "functionResponse": {
                "responseBody": {
                    "TEXT": {
                        "body": json.dumps(result)
                    }
                }
            }
        }
    }

    print(f"Returning response: {json.dumps(response)}")
    return response


def validate_customer(params):
    """Validate if a customer exists by email or customer ID."""
    email = params.get("email")
    customer_id = params.get("customerId")

    if email:
        if email in EMAIL_TO_ID:
            return {
                "valid": True,
                "customerId": EMAIL_TO_ID[email],
                "message": f"Customer found with email {email}",
            }
        return {
            "valid": False,
            "message": f"No customer found with email {email}",
        }

    if customer_id:
        if customer_id in CUSTOMERS:
            return {
                "valid": True,
                "customerId": customer_id,
                "message": f"Customer {customer_id} found",
            }
        return {
            "valid": False,
            "message": f"No customer found with ID {customer_id}",
        }

    return {
        "valid": False,
        "message": "Please provide either email or customerId",
    }


def get_customer_details(params):
    """Get full customer details."""
    customer_id = params.get("customerId")

    if not customer_id:
        return {"error": "customerId is required"}

    if customer_id in CUSTOMERS:
        return CUSTOMERS[customer_id]

    return {"error": f"Customer {customer_id} not found"}


def get_order_status(params):
    """Get order status."""
    order_id = params.get("orderId")

    if not order_id:
        return {"error": "orderId is required"}

    if order_id in ORDERS:
        order = ORDERS[order_id]
        return {
            "orderId": order["orderId"],
            "status": order["status"],
            "items": order["items"],
            "total": order["total"],
            "orderDate": order["orderDate"],
            "deliveryInfo": order.get("deliveryDate") or order.get("estimatedDelivery"),
        }

    return {"error": f"Order {order_id} not found"}


def create_support_ticket(params):
    """Create a new support ticket."""
    global ticket_counter

    customer_id = params.get("customerId")
    subject = params.get("subject")
    description = params.get("description")
    priority = params.get("priority", "medium")

    if not customer_id:
        return {"error": "customerId is required"}
    if not subject:
        return {"error": "subject is required"}
    if not description:
        return {"error": "description is required"}

    if customer_id not in CUSTOMERS:
        return {"error": f"Customer {customer_id} not found"}

    ticket_counter += 1
    ticket_id = f"TKT-{ticket_counter}"

    return {
        "ticketId": ticket_id,
        "customerId": customer_id,
        "subject": subject,
        "description": description,
        "priority": priority,
        "status": "Open",
        "message": f"Support ticket {ticket_id} created successfully",
    }
`;
}

function generateDeployReadme(config: ProjectConfig): string {
  return `# ${config.projectName} - Bedrock Agent Deployment

AWS CDK infrastructure for deploying a helpdesk Bedrock Agent.
## Prerequisites

- AWS CLI configured with credentials
- Node.js 18+ and npm
- AWS CDK CLI (\`npm install -g aws-cdk\`)
- Bedrock model access enabled in your AWS account for Claude Sonnet 4.5

## Step-by-Step Deployment Guide

### Step 1: Install Dependencies

\`\`\`bash
cd deploy
npm install
\`\`\`

### Step 2: Configure AWS Credentials

Ensure your AWS credentials are configured:

\`\`\`bash
aws configure
# Or use environment variables:
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_DEFAULT_REGION=us-east-2
\`\`\`

### Step 3: Bootstrap CDK (First Time Only)

If this is your first time using CDK in this AWS account/region:

\`\`\`bash
npx cdk bootstrap aws://ACCOUNT-ID/us-east-2
\`\`\`

Replace \`ACCOUNT-ID\` with your AWS account ID.

### Step 4: Review the Stack (Optional)

Preview what will be deployed:

\`\`\`bash
npx cdk synth
\`\`\`

### Step 5: Deploy the Stack

\`\`\`bash
npx cdk deploy
\`\`\`

When prompted, review the IAM changes and type \`y\` to confirm.

### Step 6: Note the Outputs

After deployment, note these values from the output:
- \`AgentId\`: Your Bedrock Agent ID
- \`AgentAliasId\`: The alias ID for invocation

### Step 7: Update Test Configuration

Add the agent to your \`config/shared/agents.yaml\`:

\`\`\`yaml
models:
  my-agent:
    type: bedrock-agent
    agentId: <AgentId from Step 6>
    agentAliasId: <AgentAliasId from Step 6>
    region: us-east-2
\`\`\`

### Step 8: Prepare the Agent (Important!)

The agent needs to be prepared before use:

1. Go to AWS Console → Amazon Bedrock → Agents
2. Select your agent (${config.projectName}-helpdesk)
3. Click "Prepare" to compile the agent
4. Wait for status to become "Prepared"

### Step 9: Run Tests

\`\`\`bash
cd ..
npm test
\`\`\`

## Mock Test Data

### Customers

| Customer ID | Name       | Email                    |
|-------------|------------|--------------------------|
| CUST-12345  | John Smith | john.smith@example.com   |
| CUST-67890  | Jane Doe   | jane.doe@example.com     |

### Orders

| Order ID | Customer   | Status      | Total    |
|----------|------------|-------------|----------|
| ORD-001  | CUST-12345 | Delivered   | $150.00  |
| ORD-002  | CUST-12345 | In Transit  | $75.50   |
| ORD-003  | CUST-12345 | Processing  | $299.99  |

## Cleanup

To avoid ongoing charges:

\`\`\`bash
npx cdk destroy
\`\`\`

## Troubleshooting

### "Agent not found" error

- Verify the agent is in "Prepared" state in AWS Console
- Check AgentId and AgentAliasId are correct in agents.yaml
- Ensure you're using the correct AWS region

### Lambda timeout

- Check CloudWatch Logs: \`/aws/lambda/${config.projectName}-HelpdeskActionHandler\`
- Increase timeout in \`lib/helpdesk-agent-stack.ts\` if needed

### Permission denied

- Ensure your IAM user/role has Bedrock permissions
- Check the agent role has InvokeModel permission for Claude Sonnet 4.5
- Verify Bedrock model access is enabled in your account

### "Model not available" error

- Go to AWS Console → Amazon Bedrock → Model access
- Request access to Claude Sonnet 4.5 (anthropic.claude-sonnet-4-5-20250929-v1:0)
- Wait for access to be granted (usually instant)

## Customization

### Change Foundation Model

Edit \`lib/helpdesk-agent-stack.ts\`:

\`\`\`typescript
foundationModel: 'anthropic.claude-sonnet-4-5-20250929-v1:0'  // Change to desired model
\`\`\`

### Add Real Backend

Replace mock handlers in \`lambda/index.py\` with actual database/API integrations:

\`\`\`python
# Example: Replace CUSTOMERS dict with DynamoDB lookup
import boto3

dynamodb = boto3.resource('dynamodb')
customers_table = dynamodb.Table('Customers')

def get_customer_details(params):
    customer_id = params.get("customerId")
    response = customers_table.get_item(Key={'customerId': customer_id})
    return response.get('Item', {"error": "Customer not found"})
\`\`\`

### Add More Actions

1. Add new function definitions in the \`actionGroups\` section of \`helpdesk-agent-stack.ts\`
2. Implement the handler in \`lambda/index.py\`
3. Update the agent instruction to describe the new capability

## Files Overview

| File | Description |
|------|-------------|
| \`bin/app.ts\` | CDK app entry point |
| \`lib/helpdesk-agent-stack.ts\` | Main CDK stack with Bedrock Agent and Lambda |
| \`lambda/index.py\` | Python Lambda handler with mock data |
| \`cdk.json\` | CDK configuration |
| \`package.json\` | Node.js dependencies |
| \`tsconfig.json\` | TypeScript configuration |
`;
}

function generateReadme(config: ProjectConfig): string {
  const isAgentType = config.testType === 'agent-scenario' || config.testType === 'agent-simulation';

  const deploySection = isAgentType
    ? `
## Deploy Bedrock Agent

This project includes AWS CDK infrastructure for deploying a helpdesk Bedrock Agent.

\`\`\`bash
cd deploy
npm install
npx cdk bootstrap  # First time only
npx cdk deploy
\`\`\`

After deployment, update \`config/shared/agents.yaml\` with the output values.

See [\`deploy/README.md\`](./deploy/README.md) for detailed deployment instructions.

`
    : '';

  const projectStructure = isAgentType
    ? `\`\`\`
${config.projectName}/
├── config.yaml           # Main test configuration
├── config/shared/
│   ├── agents.yaml       # Agent configuration (update after deploy)
│   ├── prompts.yaml      # Prompt definitions
│   ├── connectors.yaml   # Data source connectors
│   └── pricing.yaml      # Custom model pricing
├── custom/qualities/     # Custom quality attributes
│   └── ExampleQuality.ts
├── data/                 # Test data files
│   └── sample-data.json
├── calibration/          # Judge calibration examples
│   └── examples.yaml
├── scenarios/            # Test scenarios
│   └── example-scenario.yaml
├── deploy/               # CDK infrastructure for Bedrock Agent
│   ├── bin/app.ts
│   ├── lib/helpdesk-agent-stack.ts
│   ├── lambda/index.py
│   └── README.md
└── outputs/              # Test run outputs (gitignored)
\`\`\``
    : `\`\`\`
${config.projectName}/
├── config.yaml           # Main test configuration
├── config/shared/
│   ├── prompts.yaml      # Prompt definitions
│   ├── connectors.yaml   # Data source connectors
│   └── pricing.yaml      # Custom model pricing
├── custom/qualities/     # Custom quality attributes
│   └── ExampleQuality.ts
├── data/                 # Test data files
│   └── sample-data.json
├── calibration/          # Judge calibration examples
│   └── examples.yaml
└── outputs/              # Test run outputs (gitignored)
\`\`\``;

  return `# ${config.projectName}

${config.description}

## Quick Start

\`\`\`bash
# Install dependencies
npm install

# Validate configuration
npm run validate

# Run tests
npm test
\`\`\`
${deploySection}
## Project Structure

${projectStructure}

## Configuration

Edit \`config.yaml\` to configure:
- Test type and parameters
- LLM model settings
- Quality attributes to evaluate
- Data connectors

## Custom Quality Attributes

Add custom quality attributes in \`custom/qualities/\`:

\`\`\`typescript
import { QualityAttributeDefinition } from '@ai-test-harness/core';

export const MyQuality: QualityAttributeDefinition = {
  name: 'MyQuality',
  description: 'Description of what this measures',
  scoringCriteria: { /* 1-5 scale definitions */ },
  evaluationGuidelines: 'Instructions for the judge...',
};
\`\`\`

Then reference in \`config.yaml\`:
\`\`\`yaml
qualityAssessment:
  attributes:
    - custom/qualities/MyQuality
\`\`\`

## Documentation

See the [AI Test Harness documentation](https://github.com/your-org/ai-test-harness) for more details.
`;
}

function printProjectStructure(projectName: string, testType: string): void {
  console.log(`  ${projectName}/`);
  console.log(`  ├── config.yaml`);
  console.log(`  ├── config/shared/`);
  console.log(`  │   ├── prompts.yaml`);
  console.log(`  │   ├── connectors.yaml`);
  console.log(`  │   └── pricing.yaml`);
  console.log(`  ├── custom/qualities/`);
  console.log(`  │   └── ExampleQuality.ts`);
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
    console.log(`  │   ├── lambda/index.py`);
    console.log(`  │   └── README.md        ${chalk.cyan('← Deployment guide')}`);
  }

  console.log(`  ├── outputs/             (gitignored)`);
  console.log(`  ├── package.json`);
  console.log(`  ├── tsconfig.json`);
  console.log(`  └── README.md`);
}

