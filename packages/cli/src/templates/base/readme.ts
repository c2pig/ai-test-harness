/**
 * README.md template
 */

import { ProjectConfig } from '../../generators/types';

export function generateReadme(config: ProjectConfig): string {
  const isAgentType = config.testType === 'agent-scenario' || config.testType === 'agent-simulation';

  const deploySection = isAgentType
    ? `
## Deploy Bedrock Agent

This project includes AWS CDK infrastructure for deploying a helpdesk Bedrock Agent using ${config.agentModelId}.

\`\`\`bash
cd deploy
npm install
AWS_DEFAULT_REGION=us-east-2 npx cdk bootstrap  # First time only
AWS_DEFAULT_REGION=us-east-2 npx cdk deploy
\`\`\`

After deployment, update \`config/shared/agents.yaml\` with the output values.

See [\`deploy/README.md\`](./deploy/README.md) for detailed deployment instructions.

`
    : '';

  const projectStructure = isAgentType
    ? `\`\`\`
${config.projectName}/
├── config.yaml           # Main test configuration
├── config/shared/
│   ├── agents.yaml       # Agent configuration (update after deploy)
│   ├── prompts.yaml      # Prompt definitions
│   ├── connectors.yaml   # Data source connectors
│   └── pricing.yaml      # Custom model pricing
├── custom/qualities/     # Custom quality attributes
│   └── ResponseClarity.ts
├── data/                 # Test data files
│   └── sample-data.json
├── calibration/          # Judge calibration examples
│   └── examples.yaml
├── scenarios/            # Test scenarios
│   └── example-scenario.yaml
├── deploy/               # CDK infrastructure for Bedrock Agent
│   ├── bin/app.ts
│   ├── lib/helpdesk-agent-stack.ts
│   ├── lambda/index.js
│   └── README.md
└── outputs/              # Test run outputs (gitignored)
\`\`\``
    : `\`\`\`
${config.projectName}/
├── config.yaml           # Main test configuration
├── config/shared/
│   ├── prompts.yaml      # Prompt definitions
│   ├── connectors.yaml   # Data source connectors
│   └── pricing.yaml      # Custom model pricing
├── custom/qualities/     # Custom quality attributes
│   └── ResponseClarity.ts
├── data/                 # Test data files
│   └── sample-data.json
├── calibration/          # Judge calibration examples
│   └── examples.yaml
└── outputs/              # Test run outputs (gitignored)
\`\`\``;

  return `# ${config.projectName}

${config.description}

## Quick Start

\`\`\`bash
# Install dependencies
npm install

# Validate configuration
npm run validate

# Run tests
npm test
\`\`\`
${deploySection}
## Project Structure

${projectStructure}

## Configuration

Edit \`config.yaml\` to configure:
- Test type and parameters
- LLM model settings
- Quality attributes to evaluate
- Data connectors

## Custom Quality Attributes

Add custom quality attributes in \`custom/qualities/\`:

\`\`\`typescript
import { QualityAttributeDefinition } from '@ai-test-harness/core';

export const MyQuality: QualityAttributeDefinition = {
  name: 'MyQuality',
  description: 'Description of what this measures',
  scoringCriteria: { /* 1-5 scale definitions */ },
  evaluationGuidelines: 'Instructions for the judge...',
};
\`\`\`

Then reference in \`config.yaml\`:
\`\`\`yaml
qualityAssessment:
  attributes:
    - custom/qualities/MyQuality
\`\`\`

## Documentation

See the [AI Test Harness documentation](https://github.com/your-org/ai-test-harness) for more details.
`;
}

