import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';

export class EnvLoader {
  static load(environment?: string): void {
    const env = environment || process.env.NODE_ENV || 'development';

    let envFile: string;

    if (env === 'staging') {
      envFile = path.resolve(__dirname, '../../config/.env.staging');
    } else if (env === 'production') {
      envFile = path.resolve(__dirname, '../../config/.env.production');
    } else {
      envFile = path.resolve(__dirname, '../../.env');
    }

    if (!fs.existsSync(envFile)) {
      Logger.warn(`Environment file not found: ${envFile}`);
      return;
    }

    Logger.debug(`Loading environment from: ${envFile}`);

    const envContent = fs.readFileSync(envFile, 'utf-8');
    const lines = envContent.split('\n');

    lines.forEach(line => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) {
        return;
      }

      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();

        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });

    Logger.debug(`Environment loaded: ${env}`);
  }
}
