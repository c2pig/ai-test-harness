/**
 * Version Command
 *
 * Displays the current schema version and supported versions.
 *
 * Usage:
 *   ai-test-harness version
 */

import chalk from 'chalk';
import { CURRENT_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS } from '@ai-test-harness/core';

export async function versionCommand(): Promise<void> {
  console.log(chalk.bold('\n📋 AI Test Harness - Schema Version\n'));
  console.log('='.repeat(50));
  console.log('');
  console.log(`Current Version: ${chalk.cyan(CURRENT_SCHEMA_VERSION)}`);
  console.log('');
  console.log('Supported Versions:');
  SUPPORTED_SCHEMA_VERSIONS.forEach((version: string) => {
    const isCurrent = version === CURRENT_SCHEMA_VERSION;
    console.log(`  ${isCurrent ? chalk.green('→') : ' '} ${version}${isCurrent ? chalk.dim(' (current)') : ''}`);
  });
  console.log('');
}

