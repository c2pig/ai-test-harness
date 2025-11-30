/**
 * config.yaml templates
 */

import { ProjectConfig } from '../../generators/types';

export function generateConfigYaml(config: ProjectConfig): string {
  if (config.testType === 'agent-simulation') {
    return generateAgentSimulationConfig(config);
  }
  return generateTextGenerationConfig(config);
}

function generateAgentSimulationConfig(config: ProjectConfig): string {
  return `# AI Test Harness Configuration
schemaVersion: "1.0.0"

project:
  name: ${config.projectName}
  description: "${config.description}"

testPlan:
  type: agent-simulation
  region: us-east-2
  
  # Configure your Bedrock Agent
  agent: my-agent  # Reference from config/shared/agents.yaml
  batchSize: 3
  
  # User simulator configuration
  userSimulator:
    modelId: ${config.modelId}
    temperature: 0.8
    topP: 1.0
    maxTokens: 500
  
  # Conversation control
  conversationControl:
    maxTurns: 15
  
  # Load scenarios
  scenariosPath: "./scenarios/**/*.yaml"

evaluationPlan:
  region: us-east-2
  judgeModel:
    modelId: ${config.judgeModelId}
    temperature: 0.3
    topP: 1.0

  qualityAssessment:
    attributes:
      - ResponseQuality
      - QuestioningStrategy
      - EvidenceGathering
      # Add your custom attributes from custom/qualities/
      # - custom/qualities/ResponseClarity

    solutionDescription: "${config.description}"
    calibrationPath: "./calibration/examples.yaml"
`;
}

function generateTextGenerationConfig(config: ProjectConfig): string {
  return `# AI Test Harness Configuration
schemaVersion: "1.0.0"

project:
  name: ${config.projectName}
  description: "${config.description}"

testPlan:
  type: text-generation
  region: us-east-2
  sampleSize: 3
  batchSize: 1

  # Prompt configuration (defined in config/shared/prompts.yaml)
  prompt: main-prompt

  # Data connector (defined in config/shared/connectors.yaml)
  connectors:
    logs: local-data

  # LLM configuration
  llmConfig:
    - modelId: ${config.modelId}
      temperature: 0.7
      topP: 0.9
      maxTokens: 1000

evaluationPlan:
  region: us-east-2
  judgeModel:
    modelId: ${config.judgeModelId}
    temperature: 0
    topP: 1.0
    maxTokens: 2000

  qualityAssessment:
    attributes:
      - ZeroHallucination
      - CleanOutput
      # Add your custom attributes from custom/qualities/
      # - custom/qualities/ResponseClarity

    solutionDescription: "${config.description}"
    calibrationPath: "./calibration/examples.yaml"
`;
}
