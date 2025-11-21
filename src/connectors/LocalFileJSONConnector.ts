import * as fs from 'fs';
import * as path from 'path';
import { LocalFileJSONConfig, IConnector } from './types';
import { Logger } from '../utils/logger';
import { applyOutputSchemaToArray } from '../utils/schemaTransformer';
import { extractValue } from '../utils/jsonPathExtractor';

export class LocalFileJSONConnector implements IConnector {
  private config: LocalFileJSONConfig;

  constructor(config: LocalFileJSONConfig) {
    this.config = config;

    // Validate required outputSchema
    if (!this.config.outputSchema || Object.keys(this.config.outputSchema).length === 0) {
      throw new Error(
        '[LocalFileJSON] outputSchema is required and must not be empty. ' +
          'Define outputSchema in connector configuration to specify field extraction.'
      );
    }
  }

  async fetch(): Promise<any[]> {
    Logger.info(`[LocalFileJSON] Connector: ${this.config.name}`);
    Logger.info(`[LocalFileJSON] File Path: ${this.config.filePath}`);

    // Resolve the file path relative to the project root
    const projectRoot = process.cwd();
    const resolvedPath = path.resolve(projectRoot, this.config.filePath);

    Logger.info(`[LocalFileJSON] Resolved Path: ${resolvedPath}`);

    try {
      // Check if path exists
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File or directory not found: ${resolvedPath}`);
      }

      const stats = fs.statSync(resolvedPath);
      let allData: any[] = [];

      if (stats.isDirectory()) {
        // Read all .json files in the directory
        Logger.info(`[LocalFileJSON] Reading all .json files from directory...`);
        const files = fs
          .readdirSync(resolvedPath)
          .filter(file => file.endsWith('.json'))
          .map(file => path.join(resolvedPath, file));

        Logger.info(`[LocalFileJSON] Found ${files.length} JSON files`);

        for (const file of files) {
          const fileData = this.readJSONFile(file);
          allData = allData.concat(fileData);
        }
      } else {
        // Read single JSON file
        Logger.info(`[LocalFileJSON] Reading single JSON file...`);
        allData = this.readJSONFile(resolvedPath);
      }

      Logger.info(`[LocalFileJSON] Total records loaded: ${allData.length}`);

      // Apply maxRecords limit if configured
      const recordsToProcess =
        this.config.maxRecords && allData.length > this.config.maxRecords
          ? allData.slice(0, this.config.maxRecords)
          : allData;

      if (this.config.maxRecords && allData.length > this.config.maxRecords) {
        Logger.info(
          `[LocalFileJSON] Limiting results from ${allData.length} to ${this.config.maxRecords} records`
        );
      }

      // Apply outputSchema transformation
      const transformed = applyOutputSchemaToArray(
        recordsToProcess,
        this.config.outputSchema,
        'LocalFileJSON'
      );

      // Add _metadata to each transformed item for test identification
      return transformed.map((item, index) => {
        const sourceRecord = recordsToProcess[index];
        let recordKeyValue = undefined;

        // Try to extract recordKey from source record
        if (this.config.recordKey) {
          // First check at root level
          recordKeyValue = sourceRecord[this.config.recordKey];

          // If not found and _metadata exists, check inside _metadata
          if (!recordKeyValue && sourceRecord._metadata) {
            recordKeyValue = sourceRecord._metadata[this.config.recordKey];
          }
        }

        return {
          ...item,
          _metadata: {
            // Preserve original metadata if it exists
            ...(sourceRecord._metadata || {}),
            // Add connector metadata
            sourceFile: this.config.filePath,
            index,
            // Generic recordKey field for consistent connector-TestRunner integration
            recordKey: recordKeyValue,
          },
        };
      });
    } catch (error) {
      Logger.error(`[LocalFileJSON] Failed to read from ${resolvedPath}`, error);
      throw error;
    }
  }

  /**
   * Reads and parses a JSON file
   * Supports optional dataPath to extract nested arrays
   */
  private readJSONFile(filePath: string): any[] {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      let data = JSON.parse(content);

      Logger.debug(`[LocalFileJSON] Loaded file: ${path.basename(filePath)}`);

      // If dataPath is configured, extract the nested array
      if (this.config.dataPath) {
        Logger.debug(`[LocalFileJSON] Extracting data from path: ${this.config.dataPath}`);
        data = extractValue(data, this.config.dataPath);
      }

      // Ensure data is an array
      if (!Array.isArray(data)) {
        Logger.debug(`[LocalFileJSON] Data is not an array, wrapping in array`);
        data = [data];
      }

      Logger.debug(
        `[LocalFileJSON] File ${path.basename(filePath)} contains ${data.length} records`
      );

      return data;
    } catch (error: any) {
      throw new Error(`Failed to read or parse JSON file ${filePath}: ${error.message}`);
    }
  }

  getMaxRecords(): number | undefined {
    return this.config.maxRecords;
  }

  getRecordKey(): string | undefined {
    return this.config.recordKey;
  }
}
