import { Pool } from 'pg';
import { PostgreSQLConfig, IConnector } from './types';
import { SecretsManager } from '../core/SecretsManager';
import { Logger } from '../utils/logger';
import { retryWithBackoff } from '../utils/retry';
import { applyOutputSchemaToArray } from '../utils/schemaTransformer';

export class PostgreSQLConnector implements IConnector {
  private config: PostgreSQLConfig;
  private secretsManager: SecretsManager;
  private pool?: Pool;

  constructor(config: PostgreSQLConfig) {
    this.config = config;

    // Validate required outputSchema
    if (!this.config.outputSchema || Object.keys(this.config.outputSchema).length === 0) {
      throw new Error(
        '[PostgreSQL] outputSchema is required and must not be empty. ' +
          'Define outputSchema in connector configuration to specify field extraction.'
      );
    }

    this.secretsManager = new SecretsManager();
    Logger.info(`[PostgreSQL] Initialized connector: ${config.name}`);
  }

  private async getPool(): Promise<Pool> {
    if (this.pool) {
      Logger.info(`[PostgreSQL] Using existing connection pool`);
      return this.pool;
    }

    Logger.info(`[PostgreSQL] Creating new connection pool...`);

    const host = process.env.DB_HOST;
    const port = parseInt(process.env.DB_PORT || '5432');
    const database = process.env.DB_NAME;

    Logger.info(`[PostgreSQL] DB_HOST from env: ${host}`);
    Logger.info(`[PostgreSQL] DB_PORT from env: ${port}`);
    Logger.info(`[PostgreSQL] DB_NAME from env: ${database}`);

    if (!host || !database) {
      Logger.error(
        `[PostgreSQL] ✗ Missing environment variables - DB_HOST: ${!!host}, DB_NAME: ${!!database}`
      );
      throw new Error('Missing database environment variables: DB_HOST, DB_PORT, DB_NAME');
    }

    const secretName = process.env.DB_SECRET_NAME;
    if (!secretName) {
      Logger.error(`[PostgreSQL] ✗ Missing DB_SECRET_NAME environment variable`);
      throw new Error('Missing environment variable: DB_SECRET_NAME');
    }

    Logger.info(`[PostgreSQL] Retrieving credentials from Secrets Manager: ${secretName}`);
    const secret = await this.secretsManager.getSecret(secretName);

    const user = secret.username;
    const password = secret.password;

    if (!user || !password) {
      Logger.error(
        `[PostgreSQL] ✗ Missing credentials in secret - username: ${!!user}, password: ${!!password}`
      );
      throw new Error('Missing credentials in secret: username, password');
    }

    Logger.info(`[PostgreSQL] ✓ Credentials retrieved - username: ${user}`);

    this.pool = new Pool({
      host,
      port,
      database,
      user,
      password,
      max: 5,
      idleTimeoutMillis: 30000,
    });

    Logger.info(`[PostgreSQL] ✓ Connection pool created: ${database} at ${host}:${port}`);

    return this.pool;
  }

  async fetch(): Promise<any[]> {
    Logger.info(`[PostgreSQL] Validating query for write operations...`);
    if (this.config.query.match(/DELETE|UPDATE|INSERT|DROP|ALTER/i)) {
      Logger.error(`[PostgreSQL] ✗ Query contains forbidden write operation`);
      throw new Error('Write operations are not allowed');
    }
    Logger.info(`[PostgreSQL] ✓ Query validated (read-only)`);

    const pool = await this.getPool();

    try {
      Logger.info(`[PostgreSQL] Executing query...`);
      Logger.info(`[PostgreSQL] Query preview: ${this.config.query.substring(0, 100)}...`);

      const result = await retryWithBackoff(() => pool.query(this.config.query), 3, 1000);

      Logger.info(`[PostgreSQL] ✓ Query executed successfully`);
      Logger.info(`[PostgreSQL] ✓ Retrieved ${result.rows.length} records`);

      // outputSchema is now required (validated in constructor)
      const transformed = applyOutputSchemaToArray(
        result.rows,
        this.config.outputSchema,
        'PostgreSQL'
      );

      // Add _metadata for test identification
      return transformed.map((item, index) => ({
        ...item,
        _metadata: {
          recordKey: result.rows[index].match_id, // Generic field for connector-TestRunner integration
          job_id: result.rows[index].job_id,
          shc_created_at: result.rows[index].shc_created_at,
        },
      }));
    } catch (error) {
      Logger.error(`[PostgreSQL] ✗ Query execution failed`, error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  getRecordKey(): string | undefined {
    return this.config.recordKey;
  }
}
