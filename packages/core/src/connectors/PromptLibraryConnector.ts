import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { PromptConfig, IConnector } from './types';
import { Logger } from '../utils/logger';

export class PromptLibraryConnector implements IConnector {
  private config: PromptConfig;

  constructor(config: PromptConfig) {
    this.config = config;
  }

  async fetch(): Promise<string> {
    const basePath =
      this.config.basePath || process.env.PROMPT_LIBRARY_PATH || '../genai-prompts';
    const fullPath = path.join(basePath, this.config.promptPath);

    try {
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Prompt file not found: ${fullPath}`);
      }

      Logger.debug(`Loading prompt from ${fullPath}`);

      const fileContent = fs.readFileSync(fullPath, 'utf-8');

      if (fullPath.endsWith('.yaml') || fullPath.endsWith('.yml')) {
        const parsed = yaml.load(fileContent) as any;
        return parsed.prompt || parsed.text || fileContent;
      }

      return fileContent;
    } catch (error) {
      Logger.error('Failed to load prompt', error);
      throw error;
    }
  }
}
