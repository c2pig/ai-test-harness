/**
 * package.json template
 */

import { ProjectConfig } from '../../generators/types';

export function generatePackageJson(config: ProjectConfig): object {
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

