/**
 * deploy/bin/app.ts template
 */

import { ProjectConfig } from '../../generators/types';

export function generateCdkAppTs(config: ProjectConfig): string {
  const stackName = config.projectName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

  return `#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { HelpdeskAgentStack } from '../lib/helpdesk-agent-stack';

const app = new cdk.App();

new HelpdeskAgentStack(app, '${stackName}Stack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-2',
  },
  description: 'Bedrock Agent infrastructure for ${config.projectName}',
});
`;
}
