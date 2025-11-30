/**
 * Run Command
 *
 * Executes tests in the current project directory.
 *
 * Usage:
 *   ai-test-harness run
 *   ai-test-harness run --config=staging.yaml
 *   ai-test-harness run --model=claude-3-5-sonnet
 */

import chalk from 'chalk';
import ora from 'ora';
import { runTests } from '@ai-test-harness/core';

interface RunCommandOptions {
  config: string;
  model?: string;
  env?: string;
  verbose?: boolean;
}

export async function runCommand(options: RunCommandOptions): Promise<void> {
  console.log(chalk.bold('\n🧪 AI Test Harness - Run Tests\n'));

  const spinner = ora('Loading configuration...').start();

  try {
    spinner.text = 'Running tests...';

    const result = await runTests({
      projectPath: process.cwd(),
      configFile: options.config,
      modelOverride: options.model,
      environment: options.env,
      verbose: options.verbose,
    });

    if (result.success) {
      spinner.succeed('Tests completed successfully!');

      console.log(chalk.bold('\n📊 Results:\n'));
      console.log(`  Total tests: ${result.summary.totalTests}`);
      console.log(`  Passed: ${chalk.green(result.summary.passed)}`);
      console.log(`  Failed: ${chalk.red(result.summary.failed)}`);

      if (result.summary.avgScore !== undefined) {
        console.log(`  Average score: ${result.summary.avgScore.toFixed(2)}`);
      }

      console.log(`\n  Output directory: ${chalk.cyan(result.outputDir)}\n`);
    } else {
      spinner.fail('Tests failed');

      if (result.errors && result.errors.length > 0) {
        console.log(chalk.bold('\n❌ Errors:\n'));
        result.errors.forEach(error => {
          console.log(`  ${chalk.red('•')} ${error}`);
        });
      }

      process.exit(1);
    }
  } catch (error) {
    spinner.fail('Test execution failed');
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}
