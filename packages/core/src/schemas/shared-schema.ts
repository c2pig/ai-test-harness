/**
 * Shared Configuration Schemas
 *
 * Zod schemas for shared configuration files:
 * - config/shared/models.yaml
 * - config/shared/connectors.yaml
 */

import { z } from 'zod';

// ============================================================================
// Connector Schemas
// ============================================================================

/**
 * Base connector configuration
 */
const BaseConnectorSchema = z.object({
  type: z.string(),
});

/**
 * CloudWatch connector configuration
 */
export const CloudWatchConnectorSchema = BaseConnectorSchema.extend({
  type: z.literal('cloudwatch'),
  logGroup: z.string().min(1, 'logGroup is required'),
  dateRange: z.number().int().positive('dateRange must be a positive integer'),
  filterPattern: z.string().optional(),
  timeout: z.number().optional(),
  cacheResults: z.boolean().optional(),
  cacheTTL: z.number().optional(),
  maxRecords: z.number().int().positive().optional(),
  recordKey: z.string().min(1, 'recordKey is required'),
  outputSchema: z.record(z.string(), z.string()).refine(schema => Object.keys(schema).length > 0, {
    message: 'outputSchema must have at least one field',
  }),
});

/**
 * DynamoDB connector configuration
 */
export const DynamoDBConnectorSchema = BaseConnectorSchema.extend({
  type: z.literal('dynamodb'),
  tableName: z.string().min(1, 'tableName is required'),
  region: z.string().min(1, 'region is required'),
  recordKey: z.string().min(1, 'recordKey is required'),
  keyConditionExpression: z.string().optional(),
  filterExpression: z.string().optional(),
  expressionAttributeNames: z.record(z.string(), z.string()).optional(),
  expressionAttributeValues: z.record(z.string(), z.any()).optional(),
  outputSchema: z.record(z.string(), z.string()).refine(schema => Object.keys(schema).length > 0, {
    message: 'outputSchema must have at least one field',
  }),
});

/**
 * PostgreSQL connector configuration
 */
export const PostgreSQLConnectorSchema = BaseConnectorSchema.extend({
  type: z.literal('postgresql'),
  host: z.string().min(1, 'host is required'),
  port: z.number().int().positive().default(5432),
  database: z.string().min(1, 'database is required'),
  user: z.string().min(1, 'user is required'),
  password: z.string().min(1, 'password is required'),
  query: z.string().min(1, 'query is required'),
  recordKey: z.string().min(1, 'recordKey is required'),
  outputSchema: z.record(z.string(), z.string()).refine(schema => Object.keys(schema).length > 0, {
    message: 'outputSchema must have at least one field',
  }),
});

/**
 * Local File JSON connector configuration
 */
export const LocalFileJSONConnectorSchema = BaseConnectorSchema.extend({
  type: z.literal('local-file-json'),
  filePath: z.string().min(1, 'filePath is required'),
  recordKey: z.string().min(1, 'recordKey is required'),
  outputSchema: z.record(z.string(), z.string()).refine(schema => Object.keys(schema).length > 0, {
    message: 'outputSchema must have at least one field',
  }),
});

/**
 * Prompt Library connector configuration
 */
export const PromptLibraryConnectorSchema = BaseConnectorSchema.extend({
  type: z.literal('prompt-library'),
  libraryPath: z.string().min(1, 'libraryPath is required'),
});

/**
 * Unified connector schema (discriminated union)
 */
export const ConnectorConfigSchema = z.discriminatedUnion('type', [
  CloudWatchConnectorSchema,
  DynamoDBConnectorSchema,
  PostgreSQLConnectorSchema,
  LocalFileJSONConnectorSchema,
  PromptLibraryConnectorSchema,
]);

/**
 * Connectors file schema (config/shared/connectors.yaml)
 */
export const ConnectorsFileSchema = z.object({
  connectors: z.record(z.string(), ConnectorConfigSchema),
});

// ============================================================================
// Model Schemas
// ============================================================================

/**
 * Base model configuration
 */
const BaseModelSchema = z.object({
  type: z.string(),
});

/**
 * Bedrock Agent model configuration
 */
export const BedrockAgentModelSchema = BaseModelSchema.extend({
  type: z.literal('bedrock-agent'),
  agentId: z.string().min(1, 'agentId is required'),
  agentAliasId: z.string().min(1, 'agentAliasId is required'),
  region: z.string().min(1, 'region is required'),
  inputKeys: z.array(z.string()).optional(),
  enableTrace: z.boolean().optional().default(false),
});

/**
 * Prompt model configuration
 */
export const PromptModelSchema = BaseModelSchema.extend({
  type: z.literal('prompt'),
  basePath: z.string().min(1, 'basePath is required'),
  promptPath: z.string().min(1, 'promptPath is required'),
  inputKeys: z.array(z.string()).min(1, 'inputKeys must have at least one key'),
});

/**
 * Unified model schema (discriminated union)
 */
export const ModelConfigSchema = z.discriminatedUnion('type', [
  BedrockAgentModelSchema,
  PromptModelSchema,
]);

/**
 * Models file schema (config/shared/models.yaml or agents.yaml/prompts.yaml)
 */
export const ModelsFileSchema = z.object({
  models: z.record(z.string(), ModelConfigSchema),
});

// ============================================================================
// Type Exports
// ============================================================================

export type CloudWatchConnector = z.infer<typeof CloudWatchConnectorSchema>;
export type DynamoDBConnector = z.infer<typeof DynamoDBConnectorSchema>;
export type PostgreSQLConnector = z.infer<typeof PostgreSQLConnectorSchema>;
export type LocalFileJSONConnector = z.infer<typeof LocalFileJSONConnectorSchema>;
export type PromptLibraryConnector = z.infer<typeof PromptLibraryConnectorSchema>;
export type ConnectorConfig = z.infer<typeof ConnectorConfigSchema>;
export type ConnectorsFile = z.infer<typeof ConnectorsFileSchema>;

export type BedrockAgentModel = z.infer<typeof BedrockAgentModelSchema>;
export type PromptModel = z.infer<typeof PromptModelSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type ModelsFile = z.infer<typeof ModelsFileSchema>;
