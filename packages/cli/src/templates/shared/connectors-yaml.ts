/**
 * config/shared/connectors.yaml template
 */

export function generateConnectorsYaml(): string {
  return `# Data Connectors
#
# Define data sources for your tests. Reference them in config.yaml.

connectors:
  local-data:
    type: local-file-json
    filePath: ./data/sample-data.json
    recordKey: id  # Unique identifier field for each test record
    outputSchema:
      id: "$.id"
      question: "$.question"
      context: "$.context"
      expectedOutput: "$.expectedOutput"

  # Example: CloudWatch connector
  # cloudwatch-logs:
  #   type: cloudwatch
  #   logGroupName: /aws/lambda/my-function
  #   region: us-east-1
  #   outputSchema:
  #     input: "$.message.input"
  #     output: "$.message.output"
`;
}
