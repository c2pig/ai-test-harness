/**
 * deploy/README.md template
 */

import { ProjectConfig } from '../../generators/types';

export function generateDeployReadme(config: ProjectConfig): string {
  return `# ${config.projectName} - Bedrock Agent Deployment

AWS CDK infrastructure for deploying a helpdesk Bedrock Agent.

## Prerequisites

- AWS CLI configured with credentials
- Node.js 18+ and npm
- AWS CDK CLI (\`npm install -g aws-cdk\`)
- Bedrock model access enabled for ${config.agentModelId}

## Deployment Steps

### 1. Install Dependencies

\`\`\`bash
cd deploy
npm install
\`\`\`

### 2. Bootstrap CDK (First Time Only)

\`\`\`bash
AWS_DEFAULT_REGION=us-east-2 npx cdk bootstrap
\`\`\`

### 3. Deploy

\`\`\`bash
AWS_DEFAULT_REGION=us-east-2 npx cdk deploy
\`\`\`

### 4. Update Test Configuration

After deployment, update \`config/shared/agents.yaml\` with the output values:

\`\`\`yaml
models:
  my-agent:
    type: bedrock-agent
    agentId: <AgentId from deployment>
    agentAliasId: <AgentAliasId from deployment>
    region: us-east-2
\`\`\`

### 5. Prepare the Agent

1. Go to AWS Console → Amazon Bedrock → Agents
2. Select your agent (${config.projectName}-helpdesk)
3. Click "Prepare" to compile the agent
4. Wait for status to become "Prepared"

## Mock Test Data

### Customers

| Customer ID | Name       | Email                    |
|-------------|------------|--------------------------|
| CUST-12345  | John Smith | john.smith@example.com   |
| CUST-67890  | Jane Doe   | jane.doe@example.com     |

### Orders

| Order ID | Customer   | Status      | Total    |
|----------|------------|-------------|----------|
| ORD-001  | CUST-12345 | Delivered   | $150.00  |
| ORD-002  | CUST-12345 | In Transit  | $75.50   |
| ORD-003  | CUST-12345 | Processing  | $299.99  |

## Cleanup

\`\`\`bash
npx cdk destroy
\`\`\`
`;
}

