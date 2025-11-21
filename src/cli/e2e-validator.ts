#!/usr/bin/env tsx

/**
 * e2e-validator.ts
 * Validates and displays tool call execution from llm-trace.yaml files
 * Usage: tsx src/cli/e2e-validator.ts <directory-path>
 * Example: tsx src/cli/e2e-validator.ts tenants/simulation-chat/outputs
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

interface ToolCallDetail {
  toolName: string;
  turnNumber: number;
  parameters: Record<string, any>;
  result?: string;
}

interface ConversationTurn {
  turnNumber: number;
  userMessage: string;
  orchestrationSteps: number;
  modelInvocations: number;
  toolCalls: string[];
  reasoning: string | null;
  latencyMs: number;
}

interface AgentTrace {
  totalSteps: number;
  orchestrationSteps: number;
  modelInvocations: number;
  toolInvocations: number;
  reasoningCaptures: number;
  conversationTurns: ConversationTurn[];
  toolCallDetails: ToolCallDetail[];
}

interface TaskLLM {
  agentId?: string;
  agentAliasId?: string;
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  timestamp?: string;
  instruction?: string;
  agentTrace: AgentTrace;
}

interface UserSimulator {
  totalTokens?: number;
  estimatedCostUSD?: number;
  turnCount: number;
}

interface LLMTrace {
  taskLLM: TaskLLM;
  userSimulator: UserSimulator;
  judgeLLM?: any;
  total?: any;
}

interface ToolCallOutput {
  name: string;
  parameter: Record<string, any>;
  turnSeq: number;
  message?: string;
}

interface TestCaseOutput {
  timestamp: string;
  testCase: string;
  totalTurn: number;
  modelId: string;
  agentId: string;
  aliasId: string;
  toolCallStack: ToolCallOutput[];
  prompt: string;
}

interface ValidationOutput {
  testCases: TestCaseOutput[];
  summary: {
    totalTestCases: number;
    totalToolCalls: number;
  };
}

function main() {
  // Check if directory parameter is provided
  if (process.argv.length < 3) {
    console.error('Error: Directory path required');
    console.error('Usage: tsx src/cli/e2e-validator.ts <directory-path>');
    console.error('Example: tsx src/cli/e2e-validator.ts tenants/simulation-chat/outputs');
    process.exit(1);
  }

  const targetDir = process.argv[2];

  // Check if directory exists
  if (!fs.existsSync(targetDir)) {
    console.error(`Error: Directory not found: ${targetDir}`);
    process.exit(1);
  }

  if (!fs.statSync(targetDir).isDirectory()) {
    console.error(`Error: Not a directory: ${targetDir}`);
    process.exit(1);
  }

  // Collect all test case results
  const testCases: TestCaseOutput[] = [];
  let totalToolCalls = 0;

  // Loop through timestamp folders
  const timestampFolders = fs
    .readdirSync(targetDir)
    .map(name => path.join(targetDir, name))
    .filter(p => {
      try {
        return fs.statSync(p).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();

  for (const timestampFolder of timestampFolders) {
    const timestamp = path.basename(timestampFolder);

    // Loop through test case folders
    const testcaseFolders = fs
      .readdirSync(timestampFolder)
      .map(name => path.join(timestampFolder, name))
      .filter(p => {
        try {
          return fs.statSync(p).isDirectory();
        } catch {
          return false;
        }
      })
      .sort();

    for (const testcaseFolder of testcaseFolders) {
      const testcase = path.basename(testcaseFolder);

      // Path to llm-trace.yaml
      const statsFile = path.join(testcaseFolder, '6-llm-trace.yaml');

      // Skip if file doesn't exist
      if (!fs.existsSync(statsFile)) {
        continue;
      }

      try {
        // Parse YAML file
        const fileContent = fs.readFileSync(statsFile, 'utf8');
        const data = yaml.load(fileContent) as LLMTrace;

        // Check if toolCallDetails exists and is not empty
        const toolCallDetails = data.taskLLM?.agentTrace?.toolCallDetails || [];
        if (toolCallDetails.length === 0) {
          continue;
        }

        // Filter tool calls with non-empty parameters
        const validToolCalls = toolCallDetails.filter(
          tc => tc.parameters && Object.keys(tc.parameters).length > 0
        );

        // Skip if no valid tool calls
        if (validToolCalls.length === 0) {
          continue;
        }

        // Extract metadata
        const turnCount = data.userSimulator?.turnCount || 0;
        const timestampValue = data.taskLLM?.timestamp || 'N/A';
        const modelId = data.taskLLM?.modelId || 'N/A';
        const agentId = data.taskLLM?.agentId || 'N/A';
        const aliasId = data.taskLLM?.agentAliasId || 'N/A';
        const prompt = data.taskLLM?.instruction || 'N/A';

        // Build tool call stack
        const toolCallStack: ToolCallOutput[] = [];
        const conversationTurns = data.taskLLM?.agentTrace?.conversationTurns || [];

        for (const toolCall of validToolCalls) {
          const toolName = toolCall.toolName;
          const turnNum = toolCall.turnNumber;
          const params = toolCall.parameters;

          // Get the user message for this turn (truncate to 100 chars)
          const turn = conversationTurns.find(t => t.turnNumber === turnNum);
          const userMsg = turn?.userMessage?.substring(0, 100) || '';

          toolCallStack.push({
            name: toolName,
            parameter: params,
            turnSeq: turnNum,
            message: userMsg ? `${userMsg}...` : undefined,
          });
        }

        totalToolCalls += toolCallStack.length;

        // Add test case to results
        testCases.push({
          timestamp: timestampValue,
          testCase: testcase,
          totalTurn: turnCount,
          modelId: modelId,
          agentId: agentId,
          aliasId: aliasId,
          toolCallStack: toolCallStack,
          prompt: prompt,
        });
      } catch (error: any) {
        console.error(`Error processing ${statsFile}: ${error.message}`);
        continue;
      }
    }
  }

  // Build final output
  const output: ValidationOutput = {
    testCases: testCases,
    summary: {
      totalTestCases: testCases.length,
      totalToolCalls: totalToolCalls,
    },
  };

  // Output JSON
  console.log(JSON.stringify(output, null, 2));
}

main();
