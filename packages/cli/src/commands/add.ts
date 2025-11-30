/**
 * Add Command
 *
 * Adds scaffolding to an existing project.
 *
 * Usage:
 *   ai-test-harness add quality MyNewQuality
 *   ai-test-harness add scenario new-scenario
 *   ai-test-harness add connector my-data-source
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';

type ScaffoldType = 'quality' | 'scenario' | 'connector';

export async function addCommand(type: string, name: string): Promise<void> {
  console.log(chalk.bold(`\n➕ AI Test Harness - Add ${type}\n`));

  // Validate type
  const validTypes: ScaffoldType[] = ['quality', 'scenario', 'connector'];
  if (!validTypes.includes(type as ScaffoldType)) {
    console.error(chalk.red(`Error: Unknown type "${type}"`));
    console.log(`\nValid types: ${validTypes.join(', ')}`);
    process.exit(1);
  }

  // Validate name
  if (!name || !/^[a-zA-Z][a-zA-Z0-9-_]*$/.test(name)) {
    console.error(
      chalk.red(
        'Error: Name must start with a letter and contain only alphanumeric characters, dashes, or underscores'
      )
    );
    process.exit(1);
  }

  try {
    switch (type as ScaffoldType) {
      case 'quality':
        await addQuality(name);
        break;
      case 'scenario':
        await addScenario(name);
        break;
      case 'connector':
        await addConnector(name);
        break;
    }
  } catch (error) {
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

async function addQuality(name: string): Promise<void> {
  const qualitiesDir = path.join(process.cwd(), 'custom', 'qualities');
  const filePath = path.join(qualitiesDir, `${name}.ts`);

  // Check if directory exists
  if (!fs.existsSync(qualitiesDir)) {
    console.error(chalk.red('Error: custom/qualities/ directory not found'));
    console.log('Make sure you are in an AI Test Harness project directory');
    process.exit(1);
  }

  // Check if file already exists
  if (fs.existsSync(filePath)) {
    console.error(chalk.red(`Error: ${name}.ts already exists`));
    process.exit(1);
  }

  // Generate quality attribute file
  const content = `/**
 * ${name} Quality Attribute
 *
 * Custom quality attribute for evaluating AI outputs.
 */

import { QualityAttributeDefinition } from '@ai-test-harness/core';

export const ${name}: QualityAttributeDefinition = {
  name: '${name}',
  description: 'TODO: Add description of what this attribute measures',
  category: 'custom',

  scoringCriteria: {
    1: 'Very poor - TODO: Define criteria for score 1',
    2: 'Poor - TODO: Define criteria for score 2',
    3: 'Acceptable - TODO: Define criteria for score 3',
    4: 'Good - TODO: Define criteria for score 4',
    5: 'Excellent - TODO: Define criteria for score 5',
  },

  evaluationGuidelines: \`
    TODO: Add guidelines for the LLM judge to evaluate this attribute.

    Consider:
    - What makes a good score?
    - What are common issues to look for?
    - What context is needed for evaluation?
  \`,

  inputConfig: {
    inputKeys: ['input', 'output'],
    requiredKeys: ['output'],
  },

  weight: 1.0,
};

export default ${name};
`;

  await fs.writeFile(filePath, content);

  console.log(chalk.green(`✓ Created ${chalk.cyan(`custom/qualities/${name}.ts`)}`));
  console.log(`\nNext steps:`);
  console.log(`  1. Edit the file to define scoring criteria and guidelines`);
  console.log(`  2. Add to config.yaml: ${chalk.yellow(`custom/qualities/${name}`)}\n`);
}

async function addScenario(name: string): Promise<void> {
  const scenariosDir = path.join(process.cwd(), 'scenarios');
  const filePath = path.join(scenariosDir, `${name}.yaml`);

  // Check if directory exists
  if (!fs.existsSync(scenariosDir)) {
    await fs.ensureDir(scenariosDir);
  }

  // Check if file already exists
  if (fs.existsSync(filePath)) {
    console.error(chalk.red(`Error: ${name}.yaml already exists`));
    process.exit(1);
  }

  // Generate scenario file
  const content = `# ${name} Test Scenario
scenarioId: ${name}
description: TODO - Add description

# Conversation examples (style guide, not exact script)
conversationExamples:
  - user: "Example message 1"
  - user: "Example message 2"

# User persona (sent to simulator only)
persona:
  - TODO - Add persona characteristics

# Context data
contextData:
  # TODO - Add context data

# Acceptance criteria (evaluated by judge)
acceptanceCriteria:
  - TODO - Add acceptance criteria
`;

  await fs.writeFile(filePath, content);

  console.log(chalk.green(`✓ Created ${chalk.cyan(`scenarios/${name}.yaml`)}`));
  console.log(`\nNext steps:`);
  console.log(`  1. Edit the file to define your test scenario`);
  console.log(`  2. Ensure scenariosPath in config.yaml includes this file\n`);
}

async function addConnector(name: string): Promise<void> {
  const connectorsPath = path.join(process.cwd(), 'custom', 'connectors.yaml');

  // Check if file exists
  if (!fs.existsSync(connectorsPath)) {
    console.error(chalk.red('Error: custom/connectors.yaml not found'));
    console.log('Make sure you are in an AI Test Harness project directory');
    process.exit(1);
  }

  // Read existing content
  const existingContent = await fs.readFile(connectorsPath, 'utf-8');

  // Check if connector already exists
  if (existingContent.includes(`${name}:`)) {
    console.error(chalk.red(`Error: Connector "${name}" already exists`));
    process.exit(1);
  }

  // Append new connector
  const newConnector = `
  ${name}:
    type: local-json  # Options: local-json, cloudwatch, dynamodb, postgresql
    filePath: ./data/${name}.json
    outputSchema:
      # TODO: Map your data fields
      input: "$.input"
      output: "$.output"
`;

  await fs.appendFile(connectorsPath, newConnector);

  console.log(chalk.green(`✓ Added connector "${chalk.cyan(name)}" to custom/connectors.yaml`));
  console.log(`\nNext steps:`);
  console.log(`  1. Edit custom/connectors.yaml to configure the connector`);
  console.log(`  2. Create the data file if using local-json`);
  console.log(`  3. Reference in config.yaml: ${chalk.yellow(`connectors.logs: ${name}`)}\n`);
}
