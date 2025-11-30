#!/usr/bin/env node

/**
 * AI Test Harness CLI
 *
 * Command-line interface for creating and running AI quality tests.
 *
 * Usage:
 *   ai-test-harness new <project-name>   Create a new test project
 *   ai-test-harness run                   Run tests in current directory
 *   ai-test-harness validate              Validate project configuration
 *   ai-test-harness add <type> <name>     Add scaffolding (quality, scenario, etc.)
 */

import { Command } from 'commander';
import { newCommand } from '../commands/new';
import { runCommand } from '../commands/run';
import { validateCommand } from '../commands/validate';
import { addCommand } from '../commands/add';
import { versionCommand } from '../commands/version';

const program = new Command();

program.name('ai-test-harness').description('CLI tool for AI quality testing').version('1.0.0');

// ai-test-harness new <project-name>
program
  .command('new <project-name>')
  .description('Create a new AI test project')
  .option(
    '-t, --template <template>',
    'Template to use (default, minimal, agent-simulation)',
    'default'
  )
  .option(
    '--type <type>',
    'Test type (text-generation, agent-scenario, agent-simulation)',
    'text-generation'
  )
  .option('-y, --yes', 'Skip prompts and use defaults')
  .action(async (projectName, options) => {
    await newCommand(projectName, options);
  });

// ai-test-harness run
program
  .command('run')
  .description('Run tests in current project')
  .option('-c, --config <file>', 'Config file to use', 'config.yaml')
  .option('-m, --model <modelId>', 'Override model ID')
  .option('-e, --env <environment>', 'Environment (dev, staging, production)')
  .option('-v, --verbose', 'Verbose output')
  .action(async options => {
    await runCommand(options);
  });

// ai-test-harness validate
program
  .command('validate')
  .description('Validate project configuration')
  .option('-c, --config <file>', 'Config file to validate', 'config.yaml')
  .action(async options => {
    await validateCommand(options);
  });

// ai-test-harness add <type> <name>
program
  .command('add <type> <name>')
  .description('Add scaffolding to project (quality, scenario, connector)')
  .action(async (type, name) => {
    await addCommand(type, name);
  });

// ai-test-harness schema-version
program
  .command('schema-version')
  .description('Show current schema version')
  .action(async () => {
    await versionCommand();
  });

program.parse();
