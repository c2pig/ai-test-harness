import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBConfig, IConnector } from './types';
import { Logger } from '../utils/logger';
import { retryWithBackoff } from '../utils/retry';
import { JSONPath } from 'jsonpath-plus';
import { applyOutputSchemaToArray } from '../utils/schemaTransformer';

export class DynamoDBConnector implements IConnector {
  private client: DynamoDBClient;
  private config: DynamoDBConfig;

  constructor(config: DynamoDBConfig) {
    this.config = config;

    // Validate required outputSchema
    if (!this.config.outputSchema || Object.keys(this.config.outputSchema).length === 0) {
      throw new Error(
        '[DynamoDB] outputSchema is required and must not be empty. ' +
          'Define outputSchema in connector configuration to specify field extraction.'
      );
    }

    const region = config.region || process.env.AWS_REGION || 'ap-southeast-2';
    this.client = new DynamoDBClient({ region });
    Logger.info(`[DynamoDB] Initialized client for region: ${region}`);
  }

  async fetch(): Promise<any[]> {
    Logger.info(`[DynamoDB] Connector: ${this.config.name}`);
    Logger.info(`[DynamoDB] Table: ${this.config.tableName}`);
    Logger.info(`[DynamoDB] Max records: ${this.config.maxRecords || 'unlimited'}`);

    try {
      // Scan the table to get all conversations
      Logger.info(`[DynamoDB] Scanning table...`);
      const command = new ScanCommand({
        TableName: this.config.tableName,
        Limit: this.config.maxRecords,
      });

      const response = await retryWithBackoff(() => this.client.send(command), 3, 1000);

      const items = response.Items || [];
      Logger.info(`[DynamoDB] ✓ Retrieved ${items.length} conversation records`);

      // Parse DynamoDB items based on configuration
      let data: any[] = items;

      // Apply legacy schemaMapping extraction if configured
      if (this.config.schemaMapping) {
        Logger.info(`[DynamoDB] Applying schemaMapping extraction (legacy)...`);
        data = items.map((item, index) => {
          return this.extractConversationData(item, index);
        });
        Logger.info(
          `[DynamoDB] ✓ Successfully extracted ${data.length} conversations using schemaMapping`
        );
      } else {
        Logger.info(`[DynamoDB] No schemaMapping configured - using raw DynamoDB items`);
      }

      // outputSchema is now required (validated in constructor)
      const transformed = applyOutputSchemaToArray(data, this.config.outputSchema, 'DynamoDB');

      // Add _metadata for test identification
      return transformed.map((item, index) => ({
        ...item,
        _metadata: {
          recordKey: data[index].conversationId, // Generic field for connector-TestRunner integration
          recordId: data[index].recordId,
          createdAt: data[index].createdAt,
        },
      }));
    } catch (error) {
      Logger.error(`[DynamoDB] ✗ Failed to fetch from table ${this.config.tableName}`, error);
      throw error;
    }
  }

  /**
   * Extract conversation data from a DynamoDB item using schema mapping
   * Note: This method is only called when schemaMapping is configured
   */
  private extractConversationData(item: any, index: number): any {
    const schema = this.config.schemaMapping!; // Safe to use ! because this is only called when schemaMapping exists

    // Extract basic fields using JSONPath
    const conversationId = this.extractField(item, schema.conversationId);
    const recordId = this.extractField(item, schema.recordId);
    const createdAt = this.extractField(item, schema.createdAt);

    if (index === 0) {
      Logger.info(`[DynamoDB] Sample extraction - conversationId: ${conversationId}`);
    }

    // Extract message history
    const messageHistory = this.extractMessageHistory(item, schema.messageHistory);

    if (index === 0) {
      Logger.info(`[DynamoDB] Sample extraction - messageHistory length: ${messageHistory.length}`);
    }

    // Extract user messages
    const userMessages = this.extractUserMessages(messageHistory, schema.extraction.userMessages);

    if (index === 0) {
      Logger.info(`[DynamoDB] Sample extraction - userMessages count: ${userMessages.length}`);
    }

    // Extract context data from first assistant message
    const contextData = this.extractContextData(messageHistory, schema.extraction.contextData);

    if (index === 0 && contextData) {
      Logger.info(
        `[DynamoDB] Sample extraction - contextData keys: ${Object.keys(contextData).join(', ')}`
      );
    }

    return {
      conversationId,
      recordId,
      createdAt,
      userMessages,
      contextData,
      messageHistory,
    };
  }

  /**
   * Extract a field from DynamoDB item using JSONPath
   */
  private extractField(item: any, path: string): any {
    const result = JSONPath({ path, json: item, wrap: false });
    return result;
  }

  /**
   * Extract and parse message history array
   */
  private extractMessageHistory(item: any, historyConfig: any): any[] {
    const messagesRaw = this.extractField(item, historyConfig.path);

    if (!Array.isArray(messagesRaw)) {
      Logger.warn(`[DynamoDB] Message history is not an array, returning empty array`);
      return [];
    }

    // Parse each message using itemStructure mapping
    return messagesRaw.map((msgItem: any) => {
      const role = this.extractField(msgItem, historyConfig.itemStructure.role);
      const content = this.extractField(msgItem, historyConfig.itemStructure.content);
      const timestamp = this.extractField(msgItem, historyConfig.itemStructure.timestamp);

      return {
        role,
        content,
        timestamp,
      };
    });
  }

  /**
   * Extract user messages by filtering message history
   */
  private extractUserMessages(messageHistory: any[], extractionConfig: any): string[] {
    // Apply filter (e.g., "role == 'user'")
    const filterCondition = extractionConfig.filter;

    // Simple filter parsing for "role == 'user'"
    const userMessages = messageHistory
      .filter(msg => {
        if (filterCondition === "role == 'user'") {
          return msg.role === 'user';
        }
        return true; // Default: include all if filter not recognized
      })
      .map(msg => msg.content);

    return userMessages;
  }

  /**
   * Extract context data from assistant message
   */
  private extractContextData(messageHistory: any[], extractionConfig: any): any {
    try {
      // Find the message to extract from
      const { source, messageIndex, contentType, extract } = extractionConfig;

      // Filter by role (source)
      const messagesOfType = messageHistory.filter(msg => msg.role === source);

      if (messagesOfType.length === 0) {
        Logger.warn(`[DynamoDB] No messages found with role: ${source}`);
        return null;
      }

      if (messageIndex >= messagesOfType.length) {
        Logger.warn(
          `[DynamoDB] Message index ${messageIndex} out of bounds (total: ${messagesOfType.length})`
        );
        return null;
      }

      const targetMessage = messagesOfType[messageIndex];
      const content = targetMessage.content;

      // Parse content based on contentType
      if (contentType === 'json') {
        try {
          const parsed = JSON.parse(content);

          // Apply JSONPath extraction if specified
          if (extract === '$') {
            return parsed; // Return entire parsed object
          } else {
            return JSONPath({ path: extract, json: parsed, wrap: false });
          }
        } catch (parseError) {
          Logger.debug(
            `[DynamoDB] Could not parse contextData as JSON (this is normal for conversations without structured context)`
          );
          return {}; // Return empty object instead of null for type consistency
        }
      }

      // Default: return raw content
      return content;
    } catch (error) {
      Logger.error(`[DynamoDB] Error extracting context data`, error);
      return null;
    }
  }

  getRecordKey(): string | undefined {
    return this.config.recordKey;
  }
}
