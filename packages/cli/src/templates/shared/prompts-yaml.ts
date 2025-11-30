/**
 * config/shared/prompts.yaml template
 */

import { ProjectConfig } from '../../generators/types';

export function generatePromptsYaml(config: ProjectConfig): string {
  return `# Prompt Definitions
#
# Define your prompts here. Reference them in config.yaml via the prompt name.

models:
  main-prompt:
    type: prompt
    basePath: ./data
    promptPath: prompt.txt
    inputKeys:
      - question
      - context
`;
}
