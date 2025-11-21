import { LLMJudge, EvaluateResult } from './LLMJudge';
import { ConversationResult } from './ConversationSimulator';
import { DynamicConversationResult, ConversationTurnDetail } from './ConversationController';
import { Logger } from '../utils/logger';
import { CalibrationExample, getAttributeDefinitions } from '../quality-library';
import {
  getAttributeWeights,
  calculateContribution,
  calculateGroupedWeightedAverages,
} from '../quality-library/weight-calculator';

export interface ConversationEvaluationContext {
  agentInstructions: string;
  conversationTranscript: string;
  scenarioDescription?: string;
  validations?: {
    toolCalls?: string[];
    escalation?: boolean;
    escalationType?: string;
  };
  acceptanceCriteria?: string[];
}

export class ConversationJudge extends LLMJudge {
  async evaluateConversation(
    solutionDescription: string,
    conversation: ConversationResult | DynamicConversationResult,
    agentInstructions: string,
    schema: any,
    modelId: string,
    attributeNames: string[],
    calibration?: { enabled: boolean; examples: CalibrationExample[] },
    validations?: any,
    acceptanceCriteria?: string[],
    inferenceConfig?: { temperature?: number; topP?: number; maxTokens?: number }
  ): Promise<EvaluateResult> {
    Logger.info('[ConversationJudge] Building conversation evaluation context...');

    // Build conversation transcript
    const transcript = this.buildTranscript(conversation);

    // Extract all tool calls from conversation
    const toolCalls = this.extractToolCalls(conversation);
    Logger.info(`[ConversationJudge] Tool calls found: ${toolCalls.length}`);

    // Build context for judge with explicit tool call data
    const context: ConversationEvaluationContext & Record<string, any> = {
      agentInstructions,
      conversationTranscript: transcript,
      toolCalls, // Explicitly pass tool calls
      validations,
      acceptanceCriteria,
    };

    Logger.info(`[ConversationJudge] Transcript: ${transcript.length} characters`);
    Logger.info(`[ConversationJudge] Turns: ${conversation.turns.length}`);
    Logger.info(`[ConversationJudge] Duration: ${conversation.totalLatencyMs}ms`);

    // Use base LLMJudge evaluate method
    const result = await this.evaluate(
      solutionDescription,
      context,
      schema,
      modelId,
      attributeNames,
      calibration,
      inferenceConfig
    );

    // Calculate weighted scores with recruiter/candidate grouping
    try {
      const weights = await getAttributeWeights(attributeNames);
      const definitions = await getAttributeDefinitions(attributeNames);

      // Extract categories from definitions
      const categories: Record<string, string> = {};
      for (const name of attributeNames) {
        categories[name] = definitions[name]?.category || 'other'; // Default to 'other'
      }

      // Calculate grouped scores with dynamic bucketing
      const grouped = calculateGroupedWeightedAverages(result.assessment, weights, categories);

      // Add weighted scores to assessment attributes
      for (const [attr, data] of Object.entries(result.assessment) as any[]) {
        if (data.score !== null && data.score !== undefined) {
          (data as any).weight = weights[attr] || 0;
          (data as any).weightedScore = calculateContribution(data.score, weights[attr] || 0);
        }
      }

      result.scoreBreakdown = {
        byCategory: grouped.byCategory,
        overall: grouped.overall,
      };

      // Log category breakdown
      const categoryLog = Object.entries(grouped.byCategory)
        .map(([cat, scores]) => `${cat}: ${scores.weightedAverage}`)
        .join(', ');
      Logger.info(
        `[ConversationJudge] Score breakdown - ${categoryLog}, Overall: ${grouped.overall.weightedAverage}`
      );
    } catch (error) {
      Logger.warn(
        '[ConversationJudge] Failed to calculate weighted scores, proceeding without weights',
        error
      );
    }

    return result;
  }

  /**
   * Extract all tool calls from conversation for explicit presentation to judge
   */
  private extractToolCalls(conversation: ConversationResult | DynamicConversationResult): any[] {
    const allToolCalls: any[] = [];

    for (let i = 0; i < conversation.turns.length; i++) {
      const turn = conversation.turns[i];

      // Type guard: check if it's DynamicConversationResult
      if ('speaker' in turn) {
        // DynamicConversationResult path
        const turnDetail = turn as ConversationTurnDetail;
        if (
          turnDetail.speaker === 'agent' &&
          turnDetail.agentToolCalls &&
          turnDetail.agentToolCalls.length > 0
        ) {
          turnDetail.agentToolCalls.forEach(tc => {
            allToolCalls.push({
              turn: turnDetail.turnNumber,
              toolName: tc.toolName,
              parameters: tc.parameters,
              result: tc.result,
            });
          });
        }
      } else {
        // ConversationResult path
        if (turn.role === 'agent' && turn.toolCalls && turn.toolCalls.length > 0) {
          turn.toolCalls.forEach(tc => {
            allToolCalls.push({
              turn: Math.floor(i / 2) + 1, // Calculate turn number
              toolName: tc.toolName,
              parameters: tc.parameters,
              result: tc.result,
            });
          });
        }
      }
    }

    return allToolCalls;
  }
  private buildTranscript(conversation: ConversationResult | DynamicConversationResult): string {
    const lines: string[] = [];

    for (let i = 0; i < conversation.turns.length; i++) {
      const turn = conversation.turns[i];

      // Type guard: check if it's DynamicConversationResult
      if ('speaker' in turn) {
        // DynamicConversationResult path
        const turnDetail = turn as ConversationTurnDetail;
        const speaker = turnDetail.speaker === 'user_simulator' ? 'USER' : 'AGENT';
        lines.push(`${speaker}: ${turnDetail.message}`);

        // Include tool calls if present
        if (turnDetail.agentToolCalls && turnDetail.agentToolCalls.length > 0) {
          turnDetail.agentToolCalls.forEach(tc => {
            lines.push(`  [TOOL CALL] ${tc.toolName}`);
            if (Object.keys(tc.parameters).length > 0) {
              lines.push(`  [PARAMETERS] ${JSON.stringify(tc.parameters)}`);
            }
          });
        }
      } else {
        // ConversationResult path
        if (turn.role === 'user') {
          lines.push(`USER: ${turn.content}`);
        } else {
          lines.push(`AGENT: ${turn.content}`);

          // Include tool calls if present
          if (turn.toolCalls && turn.toolCalls.length > 0) {
            turn.toolCalls.forEach(tc => {
              lines.push(`  [TOOL CALL] ${tc.toolName}`);
              if (Object.keys(tc.parameters).length > 0) {
                lines.push(`  [PARAMETERS] ${JSON.stringify(tc.parameters)}`);
              }
            });
          }
        }
      }

      lines.push(''); // Empty line between turns
    }

    return lines.join('\n');
  }

  /**
   * Build conversation-specific context with agent instructions and transcript
   */
  static buildConversationContext(
    agentInstructions: string,
    conversationTranscript: string,
    scenarioDescription?: string
  ): Record<string, string> {
    return {
      agentInstructions,
      conversationTranscript,
      ...(scenarioDescription && { scenarioDescription }),
    };
  }
}
