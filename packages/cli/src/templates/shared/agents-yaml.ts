/**
 * config/shared/agents.yaml template
 */

export function generateAgentsYaml(): string {
  return `# Agent Definitions
#
# Define your Bedrock agents here. Reference them in config.yaml for agent-simulation tests.

models: {}
  # Example agent configuration:
  # my-agent:
  #   type: bedrock-agent
  #   agentId: YOUR_AGENT_ID
  #   agentAliasId: YOUR_AGENT_ALIAS_ID
  #   region: us-east-2
`;
}

