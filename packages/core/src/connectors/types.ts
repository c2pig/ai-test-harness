export interface ConnectorConfig {
  name: string;
  type: 'cloudwatch' | 'postgresql' | 'prompt' | 'dynamodb' | 'bedrock-agent' | 'local-file-json';
  [key: string]: any;
}

export interface CloudWatchConfig extends ConnectorConfig {
  type: 'cloudwatch';
  logGroup: string;
  dateRange: number;
  filterPattern?: string;
  timeout?: number;
  cacheResults?: boolean;
  cacheTTL?: number;
  maxRecords?: number;
  recordKey: string; // REQUIRED: Field name to use as unique identifier for records
  // Contract: Output schema declaration (REQUIRED)
  outputSchema: Record<string, string>;
}

export interface PostgreSQLConfig extends ConnectorConfig {
  type: 'postgresql';
  query: string;
  timeout?: number;
  recordKey: string; // REQUIRED: Field name to use as unique identifier for records
  // Contract: Output schema declaration for data transformation (REQUIRED)
  outputSchema: Record<string, string>;
}

export interface PromptConfig extends ConnectorConfig {
  type: 'prompt';
  basePath: string;
  promptPath: string;
  // Contract: Input requirements declaration
  inputKeys?: string[];
}

export interface DynamoDBConfig extends ConnectorConfig {
  type: 'dynamodb';
  tableName: string;
  region?: string;
  maxRecords?: number;
  recordKey: string; // REQUIRED: Field name to use as unique identifier for records
  // Legacy conversation-specific schema mapping (optional for backward compatibility)
  schemaMapping?: {
    conversationId: string;
    recordId: string;
    createdAt: string;
    messageHistory: {
      path: string;
      itemStructure: {
        role: string;
        content: string;
        timestamp: string;
      };
    };
    extraction: {
      userMessages: {
        filter: string;
        extract: string;
      };
      contextData: {
        source: string;
        messageIndex: number;
        contentType: string;
        extract: string;
      };
    };
  };
  query?: {
    filter?: {
      dateRange?: {
        field: string;
        from?: string;
        to?: string;
      };
    };
    limit?: number;
  };
  // Generic output schema for data transformation (REQUIRED)
  outputSchema: Record<string, string>;
}

export interface BedrockAgentConfig extends ConnectorConfig {
  type: 'bedrock-agent';
  agentId: string;
  agentAliasId: string;
  region?: string;
  // Contract: Input requirements declaration (maps to sessionAttributes)
  inputKeys?: string[];
  // Optional: Static session attributes always sent with every request
  staticSessionAttributes?: Record<string, string>;
}

export interface LocalFileJSONConfig extends ConnectorConfig {
  type: 'local-file-json';
  filePath: string;
  dataPath?: string; // Optional path to extract nested arrays (e.g., "Items" for DynamoDB format)
  maxRecords?: number;
  recordKey: string; // REQUIRED: Field name to use as unique identifier for records
  // Contract: Output schema declaration (REQUIRED)
  outputSchema: Record<string, string>;
}

// Connector interface - must return items with _metadata.recordKey field for test identification
export interface IConnector {
  fetch(): Promise<any>;
}

export interface DBCredentials {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}
