/**
 * scenarios/example-scenario.yaml template
 */

import { ProjectConfig } from '../../generators/types';

export function generateScenarioYaml(config: ProjectConfig): string {
  return `# Example Test Scenario
scenarioId: example-scenario
description: Example test scenario for ${config.projectName}

# Conversation examples (style guide, not exact script)
conversationExamples:
  - user: "Hello, I have a question"
  - user: "Can you help me with this?"
  - user: "Thank you for your help"

# User persona (sent to simulator only, not judge)
persona:
  - Curious and engaged
  - Professional communication style
  - Values clear explanations

# Context data (sent to both simulator and judge)
contextData:
  exampleField: "example value"
  anotherField: 123

# Acceptance criteria (evaluated by judge)
acceptanceCriteria:
  - Agent should respond politely
  - Agent should address the question appropriately
  - Agent should provide helpful information
`;
}
