/**
 * Shared types for project generation
 */

export interface ProjectConfig {
  projectName: string;
  description: string;
  testType: string;
  modelId: string;
  judgeModelId: string;
  agentModelId: string;
}

export interface NewCommandOptions {
  template: string;
  type: string;
  yes: boolean;
}
