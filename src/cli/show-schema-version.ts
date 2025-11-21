#!/usr/bin/env tsx

/**
 * Show Schema Version CLI
 *
 * Displays the current schema version and supported versions
 */

import { CURRENT_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS } from '../schemas';

function showSchemaVersion() {
  console.log('='.repeat(60));
  console.log('Configuration Schema Version');
  console.log('='.repeat(60));
  console.log('');
  console.log(`Current Version: ${CURRENT_SCHEMA_VERSION}`);
  console.log('');
  console.log('Supported Versions:');
  SUPPORTED_SCHEMA_VERSIONS.forEach(version => {
    const isCurrent = version === CURRENT_SCHEMA_VERSION;
    console.log(`  ${isCurrent ? '→' : ' '} ${version}${isCurrent ? ' (current)' : ''}`);
  });
  console.log('');
  console.log('For schema documentation, see:');
  console.log('  docs/config-schema.md');
  console.log('');
}

showSchemaVersion();
