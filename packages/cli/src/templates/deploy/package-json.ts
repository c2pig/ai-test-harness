/**
 * deploy/package.json template
 */

import { ProjectConfig } from '../../generators/types';

export function generateDeployPackageJson(config: ProjectConfig): object {
  return {
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
  };
}

export function generateDeployTsConfig(): object {
  return {
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
  };
}

export function generateCdkJson(): object {
  return {
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
  };
}

