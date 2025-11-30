/**
 * .gitignore template
 */

export function generateGitignore(): string {
  return `# Dependencies
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

# CDK
cdk.out/
`;
}

