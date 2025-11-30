import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
  FilterLogEventsCommandOutput,
} from '@aws-sdk/client-cloudwatch-logs';
import { CloudWatchConfig, IConnector } from './types';
import { Logger } from '../utils/logger';
import { retryWithBackoff } from '../utils/retry';
import { applyOutputSchemaToArray } from '../utils/schemaTransformer';

export class CloudWatchConnector implements IConnector {
  private client: CloudWatchLogsClient;
  private config: CloudWatchConfig;

  constructor(config: CloudWatchConfig) {
    this.config = config;

    // Validate required outputSchema
    if (!this.config.outputSchema || Object.keys(this.config.outputSchema).length === 0) {
      throw new Error(
        '[CloudWatch] outputSchema is required and must not be empty. ' +
          'Define outputSchema in connector configuration to specify field extraction.'
      );
    }

    const region = process.env.AWS_REGION || 'ap-southeast-1';
    this.client = new CloudWatchLogsClient({ region });
    Logger.debug(`[CloudWatch] Initialized client for region: ${region}`);
  }

  async fetch(): Promise<any[]> {
    const endTime = Date.now();
    const startTime = endTime - this.config.dateRange * 24 * 60 * 60 * 1000;

    Logger.debug(`[CloudWatch] Connector: ${this.config.name}`);
    Logger.debug(`[CloudWatch] Log Group: ${this.config.logGroup}`);
    Logger.debug(
      `[CloudWatch] Filter Pattern: ${this.config.filterPattern || 'generateTextPattern'}`
    );
    Logger.debug(`[CloudWatch] Date Range: ${this.config.dateRange} days`);
    Logger.debug(
      `[CloudWatch] Query Period: ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`
    );
    if (this.config.maxRecords) {
      Logger.debug(`[CloudWatch] Max Records: ${this.config.maxRecords}`);
    }

    try {
      Logger.debug(`[CloudWatch] Fetching log events with pagination...`);

      // Fetch events with pagination support
      let allEvents: any[] = [];
      let nextToken: string | undefined = undefined;
      let pageCount = 0;

      do {
        pageCount++;
        const command = new FilterLogEventsCommand({
          logGroupName: this.config.logGroup,
          filterPattern: this.config.filterPattern || 'generateTextPattern',
          startTime,
          endTime,
          nextToken,
          limit: this.config.maxRecords
            ? Math.min(10000, this.config.maxRecords - allEvents.length)
            : 10000,
        });

        Logger.debug(
          `[CloudWatch] Fetching page ${pageCount}${nextToken ? ' with nextToken' : ''}...`
        );

        const response: FilterLogEventsCommandOutput = await retryWithBackoff(
          () => this.client.send(command),
          3,
          1000
        );

        const pageEvents = response.events || [];
        allEvents = allEvents.concat(pageEvents);

        Logger.debug(
          `[CloudWatch] Page ${pageCount}: Retrieved ${pageEvents.length} events (total: ${allEvents.length})`
        );

        nextToken = response.nextToken;

        // Stop if we've reached maxRecords limit
        if (this.config.maxRecords && allEvents.length >= this.config.maxRecords) {
          Logger.debug(`[CloudWatch] Reached maxRecords limit of ${this.config.maxRecords}`);
          break;
        }

        // Stop if no more pages
        if (!nextToken) {
          Logger.debug(`[CloudWatch] No more pages available`);
          break;
        }
      } while (nextToken && (!this.config.maxRecords || allEvents.length < this.config.maxRecords));

      Logger.debug(
        `[CloudWatch] ✓ Successfully retrieved ${allEvents.length} log events across ${pageCount} page(s)`
      );

      // Apply maxRecords limit if configured
      const eventsToProcess =
        this.config.maxRecords && allEvents.length > this.config.maxRecords
          ? allEvents.slice(0, this.config.maxRecords)
          : allEvents;

      if (this.config.maxRecords && allEvents.length > this.config.maxRecords) {
        Logger.debug(
          `[CloudWatch] Limiting results from ${allEvents.length} to ${this.config.maxRecords} records`
        );
      }

      Logger.debug(`[CloudWatch] Parsing ${eventsToProcess.length} events...`);
      const parsed = eventsToProcess.map((event, index) => {
        let message = null;
        if (event.message) {
          try {
            if (index === 0) {
              Logger.debug(`[CloudWatch] Raw message type: ${typeof event.message}`);
              Logger.debug(
                `[CloudWatch] Raw message first 200 chars: ${event.message.substring(0, 200)}`
              );
            }
            message = JSON.parse(event.message);
            if (index === 0) {
              Logger.debug(`[CloudWatch] After parse type: ${typeof message}`);
            }
          } catch (error: any) {
            Logger.warn(
              `[CloudWatch] Failed to parse event message: ${error?.message || 'Unknown error'}`
            );
            message = event.message;
          }
        }
        return {
          ...event,
          timestamp: event.timestamp,
          message,
        };
      });

      if (parsed.length > 0 && parsed[0].message) {
        Logger.debug(`[CloudWatch] - message type: ${typeof parsed[0].message}`);
        Logger.debug(`[CloudWatch] - recommendationId: ${parsed[0].message.recommendationId}`);
        Logger.debug(`[CloudWatch] - jobId: ${parsed[0].message.jobId}`);
        Logger.debug(`[CloudWatch] - msg field: ${parsed[0].message.msg?.substring(0, 100)}`);
      }

      Logger.info(`[CloudWatch] ✓ Events parsed successfully`);

      // Log first raw event message structure before transformation
      if (parsed.length > 0 && parsed[0].message) {
        const firstMsg = parsed[0].message;
        Logger.debug(`[CloudWatch] First event.message type: ${typeof firstMsg}`);
        Logger.debug(`[CloudWatch] First event.message keys: ${Object.keys(firstMsg).join(', ')}`);

        const msgStr = JSON.stringify(firstMsg, null, 2);
        const preview = msgStr.length > 500 ? msgStr.substring(0, 500) + '...' : msgStr;
        Logger.debug(`[CloudWatch] First event.message structure (first 500 chars):\n${preview}`);
      }

      // Parse params from msg field for each event
      // The msg field contains: "[generateTextLambda] params: {...}"
      // We need to extract the JSON params object and make it available for extraction
      const eventsWithParsedParams = parsed.map(event => {
        let parsedParams: any = null;

        if (event.message?.msg) {
          const msgContent = event.message.msg;
          const paramsMatch = msgContent.match(/\[generateTextLambda\] params: (.+)/);

          if (paramsMatch) {
            try {
              parsedParams = JSON.parse(paramsMatch[1]);
              Logger.debug(`[CloudWatch] Successfully parsed params from msg field`);
            } catch (error: any) {
              Logger.warn(
                `[CloudWatch] Failed to parse params JSON from msg field: ${error?.message || 'Unknown error'}`
              );
            }
          }
        }

        // If we successfully parsed params, nest it under the msg key
        // This allows extraction paths like 'msg.inputs.appliedSpec'
        if (parsedParams) {
          return { ...event.message, msg: parsedParams };
        }

        return event.message || event;
      });

      // outputSchema is now required (validated in constructor)
      // Transform using generic schema transformer
      const transformed = applyOutputSchemaToArray(
        eventsWithParsedParams,
        this.config.outputSchema,
        'CloudWatch'
      );

      // Log first transformed result with dynamic field names from outputSchema
      if (transformed.length > 0) {
        Logger.debug(
          `[CloudWatch] First transformed item keys: ${Object.keys(transformed[0]).join(', ')}`
        );
        Logger.debug(`[CloudWatch] Sample extracted values:`);

        // Dynamically log each field defined in outputSchema
        for (const [fieldName, _path] of Object.entries(this.config.outputSchema)) {
          const value = transformed[0][fieldName];
          if (typeof value === 'string') {
            const preview = value.length > 50 ? `"${value.substring(0, 50)}..."` : `"${value}"`;
            Logger.debug(`[CloudWatch]   - ${fieldName}: ${preview}`);
          } else {
            Logger.debug(`[CloudWatch]   - ${fieldName}: ${value}`);
          }
        }
      }

      // Add _metadata to each transformed item for test identification
      return transformed.map((item, index) => ({
        ...item,
        _metadata: {
          recordKey: parsed[index].message?.recommendationId, // Generic field for connector-TestRunner integration
          jobId: parsed[index].message?.jobId,
          timestamp: parsed[index].timestamp,
        },
      }));
    } catch (error) {
      Logger.error(`[CloudWatch] ✗ Failed to fetch logs from ${this.config.logGroup}`, error);
      throw error;
    }
  }

  getMaxRecords(): number | undefined {
    return this.config.maxRecords;
  }

  getRecordKey(): string | undefined {
    return this.config.recordKey;
  }
}
