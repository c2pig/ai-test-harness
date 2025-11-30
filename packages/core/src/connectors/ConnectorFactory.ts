import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { CloudWatchConnector } from './CloudWatchConnector';
import { PostgreSQLConnector } from './PostgreSQLConnector';
import { DynamoDBConnector } from './DynamoDBConnector';
import { LocalFileJSONConnector } from './LocalFileJSONConnector';
import { ConnectorConfig, IConnector } from './types';
import { Logger } from '../utils/logger';

export class ConnectorFactory {
  private connectors: Map<string, ConnectorConfig> = new Map();

  constructor(configPath: string = './config/shared/connectors.yaml') {
    this.loadConnectors(configPath);
  }

  private loadConnectors(configPath: string): void {
    if (!fs.existsSync(configPath)) {
      Logger.warn(`Connector config not found: ${configPath}`);
      return;
    }

    const content = fs.readFileSync(configPath, 'utf-8');
    const config = yaml.load(content) as { connectors: Record<string, ConnectorConfig> };

    Object.entries(config.connectors).forEach(([name, connectorConfig]) => {
      this.connectors.set(name, { ...connectorConfig, name });
    });

    Logger.debug(`Loaded ${this.connectors.size} connector configurations`);
  }

  getConnectorConfig(name: string): ConnectorConfig | undefined {
    return this.connectors.get(name);
  }

  create(name: string): IConnector {
    const config = this.connectors.get(name);

    if (!config) {
      throw new Error(`Connector not found: ${name}`);
    }

    // Reject model types - these should be configured in models.yaml instead
    if (config.type === 'bedrock-agent' || config.type === 'prompt') {
      throw new Error(
        `Invalid connector type '${config.type}' for connector '${name}'. ` +
          `Bedrock agents and prompts are execution models, not data connectors. ` +
          `Please configure '${name}' in config/shared/models.yaml and reference it using the model pattern:\n` +
          `  model:\n` +
          `    type: ${config.type === 'bedrock-agent' ? 'bedrock-agent' : 'prompt'}\n` +
          `    name: ${name}`
      );
    }

    switch (config.type) {
      case 'cloudwatch':
        return new CloudWatchConnector(config as any);
      case 'postgresql':
        return new PostgreSQLConnector(config as any);
      case 'dynamodb':
        return new DynamoDBConnector(config as any);
      case 'local-file-json':
        return new LocalFileJSONConnector(config as any);
      default:
        throw new Error(`Unknown connector type: ${config.type}`);
    }
  }
}
