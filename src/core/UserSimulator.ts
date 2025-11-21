import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Logger } from '../utils/logger';
import { PromptLoader } from '../utils/promptLoader';
import { retryWithBackoff } from '../utils/retry';

export interface UserSimulatorConfig {
  modelId: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  region?: string;
}

export interface ConversationMessage {
  role: 'user' | 'agent';
  content: string;
}

export interface ScenarioContext {
  scenarioId: string;
  description: string;
  conversationExamples?: Array<{ user: string }>;
  persona?: string[];
  candidateDetails?: Record<string, any>;
  contextData?: Record<string, any>;
  acceptanceCriteria?: string[];
}

export interface UserSimulatorMetrics {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  timestamp: string;
  inferenceConfig: {
    temperature: number;
    topP: number;
    maxTokens: number;
  };
}

export interface UserResponse {
  message: string;
  shouldEnd: boolean;
  reasoning?: string;
  prompt?: string; // The actual prompt sent to the LLM (captured for first turn)
  metrics: UserSimulatorMetrics;
}

export class UserSimulator {
  private client: BedrockRuntimeClient;
  private config: UserSimulatorConfig;

  constructor(config: UserSimulatorConfig) {
    const resolvedRegion = config.region || 'us-east-1';
    this.client = new BedrockRuntimeClient({
      region: resolvedRegion,
      requestHandler: new NodeHttpHandler({
        requestTimeout: 90000, // 90 seconds
        connectionTimeout: 5000, // 5 seconds to establish connection
        throwOnRequestTimeout: true, // Convert timeout warning to error for retry
      }),
    });
    this.config = config;

    Logger.info(`[UserSimulator] Initialized with model: ${config.modelId}, region: ${resolvedRegion} (timeout: 90s)`);
    Logger.info(
      `[UserSimulator] Temperature: ${config.temperature}, TopP: ${config.topP}, MaxTokens: ${config.maxTokens}`
    );
  }

  private getModelFamily(modelId: string): 'anthropic' | 'nova' {
    const cleanId = modelId.replace('bedrock:', '').toLowerCase();
    if (cleanId.includes('anthropic') || cleanId.includes('claude')) {
      return 'anthropic';
    }
    if (cleanId.includes('amazon.nova') || cleanId.includes('nova')) {
      return 'nova';
    }
    throw new Error(`[UserSimulator] Unsupported model family: ${modelId}`);
  }

  /**
   * Generate a user response based on conversation history and scenario context
   *
   * @param conversationHistory - Previous messages (agent responses only, no tool calls)
   * @param agentLastMessage - Most recent agent message
   * @param scenario - Scenario context for emergent behavior
   * @returns User response with end signal and metrics
   */
  async generateResponse(
    conversationHistory: ConversationMessage[],
    agentLastMessage: string,
    scenario: ScenarioContext
  ): Promise<UserResponse> {
    Logger.info(`[UserSimulator] Generating response for scenario: ${scenario.scenarioId}`);

    const prompt = this.buildUserSimulatorPrompt(conversationHistory, agentLastMessage, scenario);
    Logger.info(`[UserSimulator] Prompt length: ${prompt.length} characters`);

    const modelId = this.config.modelId.replace('bedrock:', '');
    Logger.info(`[UserSimulator] Invoking model: ${modelId}`);

    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    try {
      // Build request body based on model family
      const modelFamily = this.getModelFamily(this.config.modelId);
      let requestBody: any;

      if (modelFamily === 'anthropic') {
        // Anthropic Claude Messages API format (snake_case)
        requestBody = {
          anthropic_version: 'bedrock-2023-05-31',
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
        };

        // Only include topP if it's not the default value of 1.0
        if (this.config.topP !== 1.0) {
          requestBody.top_p = this.config.topP;
        }
      } else if (modelFamily === 'nova') {
        // Amazon Nova format (camelCase in inferenceConfig)
        requestBody = {
          schemaVersion: 'messages-v1',
          messages: [
            {
              role: 'user',
              content: [{ text: prompt }],
            },
          ],
          inferenceConfig: {
            maxTokens: this.config.maxTokens,
            temperature: this.config.temperature,
          },
        };

        // Only include topP if it's not the default value of 1.0
        if (this.config.topP !== 1.0) {
          requestBody.inferenceConfig.topP = this.config.topP;
        }
      }

      const command = new InvokeModelCommand({
        modelId,
        body: JSON.stringify(requestBody),
      });

      Logger.info(`[UserSimulator] Sending request to Bedrock...`);
      const response = await retryWithBackoff(
        () => this.client.send(command),
        3,
        1000,
        'UserSimulator'
      );
      const latencyMs = Date.now() - startTime;

      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      // Parse response format based on model family
      let generatedText: string;
      let inputTokens: number;
      let outputTokens: number;

      if (modelFamily === 'anthropic') {
        // Anthropic Claude Messages API format (snake_case)
        generatedText = responseBody.content?.[0]?.text || '';
        inputTokens = responseBody.usage?.input_tokens || 0;
        outputTokens = responseBody.usage?.output_tokens || 0;
      } else if (modelFamily === 'nova') {
        // Amazon Nova format (camelCase)
        generatedText = responseBody.output?.message?.content?.[0]?.text || '';
        inputTokens = responseBody.usage?.inputTokens || 0;
        outputTokens = responseBody.usage?.outputTokens || 0;
      } else {
        throw new Error(
          `[UserSimulator] Unsupported model family for response parsing: ${modelFamily}`
        );
      }

      const totalTokens = inputTokens + outputTokens;

      // Parse response for END_CONVERSATION tag and reasoning
      const { message, shouldEnd, reasoning } = this.parseUserResponse(generatedText);

      Logger.info(`[UserSimulator] ✓ Response generated`);
      Logger.info(`[UserSimulator] Message length: ${message.length} characters`);
      Logger.info(`[UserSimulator] Should end: ${shouldEnd}`);
      Logger.info(
        `[UserSimulator] Tokens: ${inputTokens} input, ${outputTokens} output, ${totalTokens} total`
      );
      Logger.info(`[UserSimulator] Latency: ${latencyMs}ms`);

      return {
        message,
        shouldEnd,
        reasoning,
        prompt: conversationHistory.length === 0 ? prompt : undefined, // Capture prompt only for first turn
        metrics: {
          modelId,
          inputTokens,
          outputTokens,
          totalTokens,
          latencyMs,
          timestamp,
          inferenceConfig: {
            temperature: this.config.temperature,
            topP: this.config.topP,
            maxTokens: this.config.maxTokens,
          },
        },
      };
    } catch (error) {
      Logger.error(`[UserSimulator] ✗ Response generation failed`, error);
      throw error;
    }
  }

  /**
   * Build the prompt for user simulator using PromptLoader
   *
   * Emergent behavior strategy:
   * - description → test intent and scenario context
   * - persona → behavioral characteristics (preferences, opinions, characteristics)
   * - conversationExamples → conversation style examples (not exact script)
   * - candidateDetails/contextData → factual background (qualifications, experience)
   *
   * Note: acceptanceCriteria is intentionally excluded from user simulator prompt
   * to prevent the simulator from knowing what behaviors are being tested.
   */
  private buildUserSimulatorPrompt(
    conversationHistory: ConversationMessage[],
    agentLastMessage: string,
    scenario: ScenarioContext
  ): string {
    // Prepare variables for YAML template
    const variables: Record<string, string> = {
      scenarioDescription: scenario.description,
      agentLastMessage,
    };

    // Persona (behavioral/subjective characteristics)
    if (scenario.persona && scenario.persona.length > 0) {
      variables.persona = scenario.persona.map(statement => `- ${statement}`).join('\n');
    }

    // Candidate background (factual data)
    // Support new contextData.candidate structure, with fallback to legacy
    let candidateDetails = scenario.candidateDetails;
    if (scenario.contextData) {
      // Check for new structure (contextData.candidate)
      if ('candidate' in scenario.contextData) {
        candidateDetails = scenario.contextData.candidate;
      } else {
        // Legacy structure (flat contextData)
        candidateDetails = scenario.contextData;
      }
    }
    if (candidateDetails) {
      variables.candidateDetails = `These are your factual details (qualifications, experience, location):\n${JSON.stringify(candidateDetails, null, 2)}`;
    }

    // Conversation style examples (not exact script to follow)
    if (scenario.conversationExamples && scenario.conversationExamples.length > 0) {
      const examples = scenario.conversationExamples
        .map((flow, idx) => `${idx + 1}. "${flow.user}"`)
        .join('\n');
      variables.conversationExamples = `Here are example messages that reflect the tone and approach for this scenario:\n${examples}\n\nNote: These are style examples, not a script. Respond naturally to the agent's actual questions.`;
    }

    // Conversation history (blackbox - only messages, no tool calls)
    if (conversationHistory.length > 0) {
      const history = conversationHistory
        .map(msg => {
          const speaker = msg.role === 'user' ? 'You' : 'Agent';
          return `${speaker}: ${msg.content}`;
        })
        .join('\n');
      variables.conversationHistory = history;
    }

    // Build prompt from YAML configuration
    return PromptLoader.buildUserSimulatorPrompt(variables);
  }

  /**
   * Parse the user simulator's response to extract message, end signal, and reasoning
   */
  private parseUserResponse(rawResponse: string): {
    message: string;
    shouldEnd: boolean;
    reasoning?: string;
  } {
    // Check for END_CONVERSATION tag
    const shouldEnd = rawResponse.includes('<END_CONVERSATION>');

    // Extract reasoning from <thinking> tags
    let reasoning: string | undefined;
    const thinkingMatch = rawResponse.match(/<thinking>([\s\S]*?)<\/thinking>/);
    if (thinkingMatch) {
      reasoning = thinkingMatch[1].trim();
    }

    // Extract message from <response> tags
    let message: string;
    const responseMatch = rawResponse.match(/<response>([\s\S]*?)<\/response>/);
    if (responseMatch) {
      message = responseMatch[1].trim();
    } else {
      // Fallback: use entire response if no tags found
      // Remove thinking and END_CONVERSATION tags
      message = rawResponse
        .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
        .replace(/<END_CONVERSATION>/g, '')
        .trim();
    }

    return {
      message,
      shouldEnd,
      reasoning,
    };
  }

  /**
   * Destroy the Bedrock client to clean up HTTP connections
   * Call this when the test runner is done to prevent hanging
   */
  destroy(): void {
    if (this.client) {
      this.client.destroy();
      Logger.info('[UserSimulator] ✓ Bedrock client destroyed');
    }
  }
}
