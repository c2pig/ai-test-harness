/**
 * tsconfig.json template
 */

export function generateTsConfig(): object {
  return {
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
  };
}
