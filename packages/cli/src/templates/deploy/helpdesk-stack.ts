/**
 * deploy/lib/helpdesk-agent-stack.ts template
 */

import { ProjectConfig } from '../../generators/types';

export function generateHelpdeskAgentStackTs(config: ProjectConfig): string {
  return `import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { Construct } from 'constructs';

export class HelpdeskAgentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lambda execution role
    const lambdaRole = new iam.Role(this, 'ActionLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Lambda function for action group
    const actionHandler = new lambda.Function(this, 'HelpdeskActionHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'),
      timeout: cdk.Duration.seconds(30),
      role: lambdaRole,
      functionName: '${config.projectName}-HelpdeskActionHandler',
    });

    // Bedrock Agent role
    const agentRole = new iam.Role(this, 'BedrockAgentRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      inlinePolicies: {
        BedrockInvoke: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
              resources: [
                \`arn:aws:bedrock:\${this.region}:\${this.account}:inference-profile/${config.agentModelId}\`,
                \`arn:aws:bedrock:\${this.region}::foundation-model/anthropic.*\`,
                \`arn:aws:bedrock:*::foundation-model/anthropic.*\`,
              ],
            }),
          ],
        }),
      },
    });

    // Allow Bedrock to invoke the Lambda
    actionHandler.addPermission('BedrockInvoke', {
      principal: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      sourceArn: \`arn:aws:bedrock:\${this.region}:\${this.account}:agent/*\`,
    });

    // Create the Bedrock Agent
    const agent = new bedrock.CfnAgent(this, 'HelpdeskAgent', {
      agentName: '${config.projectName}-helpdesk',
      agentResourceRoleArn: agentRole.roleArn,
      foundationModel: '${config.agentModelId}',
      instruction: \`You are a helpful customer support agent for a helpdesk system.
Your role is to assist customers with their inquiries about orders, account details, and support tickets.

When helping customers:
1. Always verify the customer first using their email or customer ID
2. Be polite, professional, and helpful
3. Provide accurate information based on the available data
4. Create support tickets when issues cannot be resolved immediately

Available actions:
- validateCustomer: Verify a customer exists by email or ID
- getCustomerDetails: Get full customer information
- getOrderStatus: Check the status of an order
- createSupportTicket: Create a new support ticket for unresolved issues\`,
      idleSessionTtlInSeconds: 600,
      actionGroups: [
        {
          actionGroupName: 'HelpdeskActions',
          actionGroupExecutor: {
            lambda: actionHandler.functionArn,
          },
          functionSchema: {
            functions: [
              {
                name: 'validateCustomer',
                description: 'Validates if a customer exists in the system by email or customer ID',
                parameters: {
                  email: { type: 'string', description: 'Customer email address', required: false },
                  customerId: { type: 'string', description: 'Customer ID (e.g., CUST-12345)', required: false },
                },
              },
              {
                name: 'getCustomerDetails',
                description: 'Retrieves full customer details including name, email, and account status',
                parameters: {
                  customerId: { type: 'string', description: 'Customer ID (e.g., CUST-12345)', required: true },
                },
              },
              {
                name: 'getOrderStatus',
                description: 'Gets the current status of an order',
                parameters: {
                  orderId: { type: 'string', description: 'Order ID (e.g., ORD-001)', required: true },
                },
              },
              {
                name: 'createSupportTicket',
                description: 'Creates a new support ticket for a customer issue',
                parameters: {
                  customerId: { type: 'string', description: 'Customer ID', required: true },
                  subject: { type: 'string', description: 'Brief subject of the issue', required: true },
                  description: { type: 'string', description: 'Detailed description of the issue', required: true },
                  priority: { type: 'string', description: 'Priority level: low, medium, or high', required: false },
                },
              },
            ],
          },
        },
      ],
    });

    // Create an alias for the agent
    const agentAlias = new bedrock.CfnAgentAlias(this, 'HelpdeskAgentAlias', {
      agentId: agent.attrAgentId,
      agentAliasName: 'live',
    });

    // Outputs
    new cdk.CfnOutput(this, 'AgentId', {
      value: agent.attrAgentId,
      description: 'Bedrock Agent ID',
    });

    new cdk.CfnOutput(this, 'AgentAliasId', {
      value: agentAlias.attrAgentAliasId,
      description: 'Bedrock Agent Alias ID',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: actionHandler.functionName,
      description: 'Lambda function name for action handler',
    });
  }
}
`;
}

