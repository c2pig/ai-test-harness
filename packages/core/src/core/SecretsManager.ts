import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { DBCredentials } from '../connectors/types';
import { Logger } from '../utils/logger';

export class SecretsManager {
  private client: SecretsManagerClient;
  private cache: Map<string, any> = new Map();

  constructor() {
    const region = process.env.AWS_REGION || 'ap-southeast-1';
    this.client = new SecretsManagerClient({ region });
    Logger.debug(`[SecretsManager] Initialized client for region: ${region}`);
  }

  async getSecret(secretName: string): Promise<any> {
    if (this.cache.has(secretName)) {
      Logger.info(`[SecretsManager] ✓ Using cached secret: ${secretName}`);
      return this.cache.get(secretName);
    }

    const accountId = process.env.AWS_ACCOUNT_ID;
    const region = process.env.AWS_REGION || 'ap-southeast-1';
    const arn = `arn:aws:secretsmanager:${region}:${accountId}:secret:${secretName}`;

    Logger.debug(`[SecretsManager] Retrieving secret: ${secretName}`);
    Logger.debug(`[SecretsManager] ARN: ${arn}`);

    try {
      const command = new GetSecretValueCommand({ SecretId: arn });
      Logger.debug(`[SecretsManager] Sending GetSecretValue request...`);
      const response = await this.client.send(command);

      const secret = response.SecretString ? JSON.parse(response.SecretString) : null;
      this.cache.set(secretName, secret);

      Logger.info(`[SecretsManager] ✓ Secret retrieved successfully`);
      Logger.info(`[SecretsManager] ✓ Secret fields: ${Object.keys(secret).join(', ')}`);

      return secret;
    } catch (error) {
      Logger.error(`[SecretsManager] ✗ Failed to retrieve secret: ${secretName}`, error);
      Logger.error(`[SecretsManager] ✗ ARN attempted: ${arn}`);
      throw error;
    }
  }

  async getDBCredentials(secretName: string): Promise<DBCredentials> {
    const secret = await this.getSecret(secretName);

    return {
      host: secret.host,
      port: secret.port || 5432,
      database: secret.database,
      username: secret.username,
      password: secret.password,
    };
  }
}
