#!/usr/bin/env node
/**
 * Chart Generation CLI Dispatcher
 * Routes chart generation commands to appropriate script based on test type
 *
 * Usage:
 *   npm run chart <type:tenant>
 *
 * Examples:
 *   npm run chart agent:product-outreach-simulation
 *   npm run chart text:product-listing
 *   npm run chart text:product-listing-multimodel
 */

import { execSync } from 'child_process';

function main() {
  const args = process.argv.slice(2);
  const [command] = args;

  if (!command || !command.includes(':')) {
    console.error('❌ Error: Invalid command format');
    console.log('\nUsage:');
    console.log('  npm run chart <type:tenant>');
    console.log('\nTypes:');
    console.log('  agent - Agent/conversation test charts (agent-simulation, agent-scenario, etc.)');
    console.log('  text  - Text generation test charts (single-model or multi-model)');
    console.log('\nExamples:');
    console.log('  npm run chart agent:product-outreach-simulation');
    console.log('  npm run chart text:product-listing');
    console.log('  npm run chart text:product-listing-multimodel');
    process.exit(1);
  }

  const [type, tenant] = command.split(':', 2);

  if (!tenant) {
    console.error('❌ Error: Tenant name is required');
    console.log('\nFormat: <type:tenant>');
    console.log('Example: agent:product-outreach-simulation');
    process.exit(1);
  }

  console.log(`🚀 Chart generation dispatcher`);
  console.log(`   Type: ${type}`);
  console.log(`   Tenant: ${tenant}`);
  console.log('');

  try {
    if (type === 'agent') {
      const cmd = `npx tsx scripts/conversation-flow-analysis.ts ${tenant}`;
      execSync(cmd, { stdio: 'inherit' });
    } else if (type === 'text') {
      const cmd = `npx tsx scripts/text-generation-charts.ts ${tenant}`;
      execSync(cmd, { stdio: 'inherit' });
    } else {
      console.error(`❌ Error: Unknown type '${type}'`);
      console.log('\nSupported types:');
      console.log('  • agent - For agent/conversation tests');
      console.log('  • text  - For text generation tests');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Chart generation failed');
    process.exit(1);
  }
}

main();
