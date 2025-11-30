import {
  BedrockAgentClient,
  GetAgentCommand,
  ListAgentActionGroupsCommand,
  GetAgentActionGroupCommand,
} from '@aws-sdk/client-bedrock-agent';
import { Logger } from './logger';

export interface ActionGroupParameter {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
}

export interface ActionGroupFunction {
  functionName: string;
  description?: string;
  parameters?: ActionGroupParameter[];
}

export interface ActionGroup {
  actionGroupName: string;
  actionGroupState?: string;
  description?: string;
  functions?: ActionGroupFunction[];
}

export interface KnowledgeBase {
  knowledgeBaseId: string;
  description?: string;
  knowledgeBaseState?: string;
}

export interface AgentMetadata {
  agentId?: string;
  agentVersion?: string;
  agentAliasId?: string;
  instruction: string;
  foundationModel: string;
  agentName: string;
  agentStatus: string;
  inferenceConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxTokens?: number;
  };
  actionGroups?: ActionGroup[];
  knowledgeBases?: KnowledgeBase[];
  guardrails?: Array<{ guardrailId: string; guardrailVersion: string }>;
}

export class AgentInstructionRetriever {
  private bedrockClient: BedrockAgentClient;

  constructor(region: string) {
    this.bedrockClient = new BedrockAgentClient({ region });
  }

  /**
   * Retrieve agent metadata including instructions and foundation model
   */
  async retrieve(agentId: string, agentAliasId?: string): Promise<AgentMetadata> {
    Logger.debug(
      `[AgentInstructionRetriever] Fetching instructions from Bedrock for agentId: ${agentId}`
    );

    try {
      const command = new GetAgentCommand({ agentId });
      const response = await this.bedrockClient.send(command);

      if (!response.agent) {
        throw new Error('Agent not found in Bedrock API response');
      }

      if (!response.agent.instruction) {
        throw new Error('Agent instruction field is empty');
      }

      const foundationModel = response.agent.foundationModel || 'unknown';
      const agentVersion = response.agent.agentVersion || undefined;

      // Extract inference configuration if available
      // Note: TypeScript definitions for AWS SDK may not include this, so we use type assertion
      const agentData = response.agent as any;
      const inferenceConfig = agentData.inferenceConfiguration
        ? {
            temperature: agentData.inferenceConfiguration.temperature,
            topP: agentData.inferenceConfiguration.topP,
            topK: agentData.inferenceConfiguration.topK,
            maxTokens: agentData.inferenceConfiguration.maximumLength,
          }
        : undefined;

      Logger.info(`[AgentInstructionRetriever] ✓ Successfully fetched from Bedrock`);
      Logger.debug(`[AgentInstructionRetriever] Agent name: ${response.agent.agentName}`);
      Logger.debug(`[AgentInstructionRetriever] Agent status: ${response.agent.agentStatus}`);
      Logger.debug(`[AgentInstructionRetriever] Agent version: ${agentVersion || 'not available'}`);
      Logger.debug(`[AgentInstructionRetriever] Foundation model: ${foundationModel}`);
      Logger.debug(
        `[AgentInstructionRetriever] Instruction length: ${response.agent.instruction.length} characters`
      );

      if (inferenceConfig) {
        Logger.debug(
          `[AgentInstructionRetriever] Inference config: temp=${inferenceConfig.temperature}, topP=${inferenceConfig.topP}, topK=${inferenceConfig.topK}, maxTokens=${inferenceConfig.maxTokens}`
        );
      }

      // Extract action groups
      const actionGroups: ActionGroup[] = [];
      try {
        const listActionGroupsCommand = new ListAgentActionGroupsCommand({
          agentId,
          agentVersion: 'DRAFT', // Using DRAFT version to get latest configuration
        });
        const actionGroupsResponse = await this.bedrockClient.send(listActionGroupsCommand);

        if (
          actionGroupsResponse.actionGroupSummaries &&
          actionGroupsResponse.actionGroupSummaries.length > 0
        ) {
          Logger.debug(
            `[AgentInstructionRetriever] Found ${actionGroupsResponse.actionGroupSummaries.length} action group(s)`
          );

          // Fetch detailed info for each action group
          for (const summary of actionGroupsResponse.actionGroupSummaries) {
            if (summary.actionGroupId) {
              try {
                const getActionGroupCommand = new GetAgentActionGroupCommand({
                  agentId,
                  agentVersion: 'DRAFT',
                  actionGroupId: summary.actionGroupId,
                });
                const actionGroupDetail = await this.bedrockClient.send(getActionGroupCommand);

                if (actionGroupDetail.agentActionGroup) {
                  const ag = actionGroupDetail.agentActionGroup;
                  const agData = ag as any;

                  // Extract functions from either functionSchema (native Bedrock format) or apiSchema (OpenAPI format)
                  const functions: ActionGroupFunction[] = [];

                  // First, try to extract from functionSchema (Bedrock Agent native format)
                  if (agData.functionSchema?.functions) {
                    try {
                      const bedrockFunctions = agData.functionSchema.functions;

                      bedrockFunctions.forEach((func: any) => {
                        const functionParams: ActionGroupParameter[] = [];

                        // Parse parameters from Bedrock's format: { paramName: { description, required, type } }
                        if (func.parameters) {
                          Object.entries(func.parameters).forEach(
                            ([paramName, paramObj]: [string, any]) => {
                              functionParams.push({
                                name: paramName,
                                type: paramObj.type || 'string',
                                description: paramObj.description,
                                required:
                                  paramObj.required === 'True' || paramObj.required === true,
                              });
                            }
                          );
                        }

                        functions.push({
                          functionName: func.name,
                          description: func.description,
                          parameters: functionParams.length > 0 ? functionParams : undefined,
                        });
                      });

                      Logger.debug(
                        `[AgentInstructionRetriever]   Extracted ${functions.length} function(s) from functionSchema`
                      );
                    } catch (parseError) {
                      Logger.warn(
                        `[AgentInstructionRetriever] Failed to parse functionSchema for action group ${ag.actionGroupName}: ${parseError}`
                      );
                    }
                  }

                  // If no functions found yet, try OpenAPI schema
                  if (functions.length === 0 && agData.apiSchema?.payload) {
                    try {
                      const schema = JSON.parse(agData.apiSchema.payload);

                      // Parse OpenAPI schema paths for functions/operations
                      if (schema.paths) {
                        Object.entries(schema.paths).forEach(([path, pathObj]: [string, any]) => {
                          // Each path can have multiple HTTP methods (get, post, put, delete, etc.)
                          Object.entries(pathObj).forEach(([method, operation]: [string, any]) => {
                            if (typeof operation === 'object' && operation !== null) {
                              // Extract function parameters from the operation
                              const functionParams: ActionGroupParameter[] = [];

                              // Get parameters from requestBody schema
                              if (operation.requestBody?.content?.['application/json']?.schema) {
                                const requestSchema =
                                  operation.requestBody.content['application/json'].schema;

                                // Handle direct properties
                                if (requestSchema.properties) {
                                  Object.entries(requestSchema.properties).forEach(
                                    ([paramName, paramObj]: [string, any]) => {
                                      functionParams.push({
                                        name: paramName,
                                        type: paramObj.type || 'string',
                                        description: paramObj.description,
                                        required:
                                          requestSchema.required?.includes(paramName) || false,
                                      });
                                    }
                                  );
                                }

                                // Handle schema references ($ref)
                                if (requestSchema.$ref && schema.components?.schemas) {
                                  const refName = requestSchema.$ref.split('/').pop();
                                  const referencedSchema = schema.components.schemas[refName];
                                  if (referencedSchema?.properties) {
                                    Object.entries(referencedSchema.properties).forEach(
                                      ([paramName, paramObj]: [string, any]) => {
                                        functionParams.push({
                                          name: paramName,
                                          type: paramObj.type || 'string',
                                          description: paramObj.description,
                                          required:
                                            referencedSchema.required?.includes(paramName) || false,
                                        });
                                      }
                                    );
                                  }
                                }
                              }

                              // Extract function name from operationId or generate from path+method
                              const functionName =
                                operation.operationId || `${method.toUpperCase()} ${path}`;

                              functions.push({
                                functionName,
                                description: operation.description || operation.summary,
                                parameters: functionParams.length > 0 ? functionParams : undefined,
                              });
                            }
                          });
                        });

                        Logger.debug(
                          `[AgentInstructionRetriever]   Extracted ${functions.length} function(s) from OpenAPI schema`
                        );
                      }
                    } catch (parseError) {
                      Logger.warn(
                        `[AgentInstructionRetriever] Failed to parse API schema for action group ${ag.actionGroupName}: ${parseError}`
                      );
                    }
                  }

                  actionGroups.push({
                    actionGroupName: ag.actionGroupName || 'unknown',
                    actionGroupState: ag.actionGroupState,
                    description: ag.description,
                    functions: functions.length > 0 ? functions : undefined,
                  });

                  Logger.debug(
                    `[AgentInstructionRetriever] ✓ Action group: ${ag.actionGroupName} (${ag.actionGroupState}), ${functions.length} function(s)`
                  );
                }
              } catch (agError: any) {
                Logger.warn(
                  `[AgentInstructionRetriever] Failed to fetch details for action group ${summary.actionGroupName}: ${agError.message}`
                );
              }
            }
          }
        }
      } catch (agError: any) {
        Logger.warn(
          `[AgentInstructionRetriever] Failed to fetch action groups: ${agError.message}`
        );
      }

      // Extract knowledge bases (if available in agent data)
      let knowledgeBases: KnowledgeBase[] | undefined = undefined;
      if (agentData.knowledgeBases && Array.isArray(agentData.knowledgeBases)) {
        knowledgeBases = agentData.knowledgeBases.map((kb: any) => ({
          knowledgeBaseId: kb.knowledgeBaseId || 'unknown',
          description: kb.description,
          knowledgeBaseState: kb.knowledgeBaseState,
        }));
        Logger.debug(
          `[AgentInstructionRetriever] Found ${knowledgeBases?.length ?? 0} knowledge base(s)`
        );
      }

      // Extract guardrails (if available)
      let guardrails: Array<{ guardrailId: string; guardrailVersion: string }> | undefined =
        undefined;
      if (agentData.guardrailConfiguration) {
        guardrails = [
          {
            guardrailId: agentData.guardrailConfiguration.guardrailIdentifier || 'unknown',
            guardrailVersion: agentData.guardrailConfiguration.guardrailVersion || 'DRAFT',
          },
        ];
        Logger.debug(`[AgentInstructionRetriever] Found guardrail configuration`);
      }

      return {
        agentId,
        agentVersion,
        agentAliasId,
        instruction: response.agent.instruction,
        foundationModel,
        agentName: response.agent.agentName || 'unknown',
        agentStatus: response.agent.agentStatus || 'unknown',
        inferenceConfig,
        actionGroups: actionGroups.length > 0 ? actionGroups : undefined,
        knowledgeBases,
        guardrails,
      };
    } catch (error: any) {
      Logger.error(`[AgentInstructionRetriever] ✗ Failed to fetch from Bedrock: ${error.message}`);
      throw new Error(`Failed to fetch agent instructions from Bedrock: ${error.message}`);
    }
  }
}
