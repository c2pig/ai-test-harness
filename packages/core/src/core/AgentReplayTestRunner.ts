import { Logger } from '../utils/logger';
import { ConversationResult, ConversationTurn } from './ConversationSimulator';
import {
  ExpectedToolCallValidator,
  ExpectedToolCallConfig,
  ExpectedToolCallResult,
} from '../validators';
import { IConnector } from '../connectors/types';

export interface AgentReplayConfig {
  conversationsConnector: IConnector;
  toolCallValidation?: ExpectedToolCallConfig;
}

export interface AgentReplayResult {
  conversationId: string;
  originalConversation: ConversationResult;
  toolCallValidation?: ExpectedToolCallResult;
  metadata: {
    recordId: string;
    createdAt: string;
    userMessageCount: number;
    totalTurns: number;
  };
}

export class AgentReplayTestRunner {
  private config: AgentReplayConfig;
  private toolCallValidator?: ExpectedToolCallValidator;

  constructor(config: AgentReplayConfig) {
    this.config = config;

    if (config.toolCallValidation) {
      this.toolCallValidator = new ExpectedToolCallValidator(config.toolCallValidation);
      Logger.debug('[AgentReplayTestRunner] Tool call validation enabled');
    }

    Logger.debug('[AgentReplayTestRunner] Initialized');
  }

  /**
   * Run replay tests on conversations from DynamoDB
   */
  async runTests(): Promise<AgentReplayResult[]> {
    Logger.info('[AgentReplayTestRunner] Starting agent replay tests...');

    // Fetch conversations from DynamoDB
    Logger.info('[AgentReplayTestRunner] Fetching conversations from connector...');
    const conversations = await this.config.conversationsConnector.fetch();
    Logger.info(`[AgentReplayTestRunner] Fetched ${conversations.length} conversations`);

    const results: AgentReplayResult[] = [];

    for (let i = 0; i < conversations.length; i++) {
      const conv = conversations[i];
      Logger.info(
        `[AgentReplayTestRunner] Processing conversation ${i + 1}/${conversations.length}: ${conv.conversationId}`
      );

      try {
        const result = await this.processConversation(conv);
        results.push(result);
        Logger.info(`[AgentReplayTestRunner] ✓ Conversation ${i + 1} processed`);
      } catch (error) {
        Logger.error(
          `[AgentReplayTestRunner] ✗ Failed to process conversation ${conv.conversationId}`,
          error
        );
        // Continue with next conversation
      }
    }

    Logger.info(
      `[AgentReplayTestRunner] ✓ Completed replay tests - ${results.length}/${conversations.length} successful`
    );

    return results;
  }

  /**
   * Process a single conversation from DynamoDB
   */
  private async processConversation(dbConversation: any): Promise<AgentReplayResult> {
    // Convert DynamoDB conversation to ConversationResult format
    const conversationResult = this.convertToConversationResult(dbConversation);

    // Optional: Validate tool calls
    let toolCallValidation: ExpectedToolCallResult | undefined;
    if (this.toolCallValidator) {
      Logger.debug('[AgentReplayTestRunner] Validating tool calls...');

      // Extract actual tool calls from conversation
      const actualToolCalls = this.extractToolCalls(conversationResult);
      Logger.debug(`[AgentReplayTestRunner] Found ${actualToolCalls.length} tool calls`);

      toolCallValidation = this.toolCallValidator.validate(actualToolCalls);
    }

    return {
      conversationId: dbConversation.conversationId,
      originalConversation: conversationResult,
      toolCallValidation,
      metadata: {
        recordId: dbConversation.recordId,
        createdAt: dbConversation.createdAt,
        userMessageCount: dbConversation.userMessages.length,
        totalTurns: dbConversation.messageHistory.length,
      },
    };
  }

  /**
   * Convert DynamoDB conversation format to ConversationResult format
   */
  private convertToConversationResult(dbConversation: any): ConversationResult {
    const turns: ConversationTurn[] = [];

    // Convert each message in history to a conversation turn
    for (const msg of dbConversation.messageHistory) {
      const role = msg.role === 'user' ? 'user' : 'agent';

      turns.push({
        role: role as 'user' | 'agent',
        content: msg.content,
        timestamp: msg.timestamp,
        // Tool calls would be extracted from content or metadata if available
        toolCalls: msg.toolCalls || [],
      });
    }

    // Calculate approximate latency (not available in historical data)
    // Use timestamps if available, otherwise default to 0
    let totalLatencyMs = 0;
    if (turns.length >= 2 && turns[0].timestamp && turns[turns.length - 1].timestamp) {
      const start = new Date(parseInt(turns[0].timestamp)).getTime();
      const end = new Date(parseInt(turns[turns.length - 1].timestamp)).getTime();
      totalLatencyMs = end - start;
    }

    return {
      sessionId: dbConversation.conversationId,
      turns,
      totalLatencyMs,
      startTime: turns[0]?.timestamp || new Date().toISOString(),
      endTime: turns[turns.length - 1]?.timestamp || new Date().toISOString(),
    };
  }

  /**
   * Extract tool calls from conversation result
   */
  private extractToolCalls(
    conversation: ConversationResult
  ): { toolName: string; parameters: Record<string, any> }[] {
    const toolCalls: { toolName: string; parameters: Record<string, any> }[] = [];

    for (const turn of conversation.turns) {
      if (turn.toolCalls && turn.toolCalls.length > 0) {
        for (const tc of turn.toolCalls) {
          toolCalls.push({
            toolName: tc.toolName,
            parameters: tc.parameters,
          });
        }
      }
    }

    return toolCalls;
  }

  /**
   * Get all conversation results (without validation) for judge evaluation
   */
  async getConversationsForJudge(): Promise<ConversationResult[]> {
    Logger.info('[AgentReplayTestRunner] Loading conversations for judge evaluation...');

    const conversations = await this.config.conversationsConnector.fetch();
    Logger.info(`[AgentReplayTestRunner] Loaded ${conversations.length} conversations`);

    return conversations.map((conv: any) => this.convertToConversationResult(conv));
  }
}
