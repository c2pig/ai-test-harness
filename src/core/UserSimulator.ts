import { Logger } from '../utils/logger';
import { PromptLoader } from '../utils/promptLoader';
import { retryWithBackoff } from '../utils/retry';
import {
  ILLMClient,
  LLMClientFactory,
  ChatRequest,
} from '../llm';

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

/**
 * User Simulator for agent conversation testing
 *
 * Supports dependency injection for testing:
 *   const mockClient = new MockAdapter();
 *   const simulator = new UserSimulator(config, mockClient);
 *
 * Or uses LLMClientFactory for provider switching via env vars:
 *   LLM_PROVIDER=litellm LITELLM_URL=... npm run test:tenant
 */
export class UserSimulator {
  private client: ILLMClient;
  private config: UserSimulatorConfig;

  constructor(config: UserSimulatorConfig, client?: ILLMClient) {
    const resolvedRegion = config.region || 'us-east-1';
    // Allow injection for testing, otherwise use factory
    this.client = client || LLMClientFactory.create({ region: resolvedRegion });
    this.config = config;

    Logger.info(
      `[UserSimulator] Initialized with model: ${config.modelId}, region: ${resolvedRegion}`
    );
    Logger.info(
      `[UserSimulator] Temperature: ${config.temperature}, TopP: ${config.topP}, MaxTokens: ${config.maxTokens}`
    );
    Logger.info(`[UserSimulator] Using ${client ? 'injected' : 'factory'} client`);
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

    const timestamp = new Date().toISOString();

    try {
      // Build chat request
      const request: ChatRequest = {
        model: this.config.modelId,
        messages: [{ role: 'user', content: prompt }],
        temperature: this.config.temperature,
        top_p: this.config.topP,
        max_tokens: this.config.maxTokens,
      };

      Logger.info(`[UserSimulator] Sending request via LLM client...`);

      // Use retry wrapper around client.chat
      const response = await retryWithBackoff(
        () => this.client.chat(request),
        3,
        1000,
        'UserSimulator'
      );

      const { content, usage, latency_ms } = response;

      // Parse response for END_CONVERSATION tag and reasoning
      const { message, shouldEnd, reasoning } = this.parseUserResponse(content);

      Logger.info(`[UserSimulator] ✓ Response generated`);
      Logger.info(`[UserSimulator] Message length: ${message.length} characters`);
      Logger.info(`[UserSimulator] Should end: ${shouldEnd}`);
      Logger.info(
        `[UserSimulator] Tokens: ${usage.prompt_tokens} input, ${usage.completion_tokens} output, ${usage.total_tokens} total`
      );
      Logger.info(`[UserSimulator] Latency: ${latency_ms}ms`);

      return {
        message,
        shouldEnd,
        reasoning,
        prompt: conversationHistory.length === 0 ? prompt : undefined, // Capture prompt only for first turn
        metrics: {
          modelId,
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          latencyMs: latency_ms,
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
   * Destroy the LLM client to clean up resources
   */
  destroy(): void {
    this.client.destroy();
    Logger.info('[UserSimulator] ✓ Client destroyed');
  }
}
