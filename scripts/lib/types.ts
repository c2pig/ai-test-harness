/**
 * Type definitions for conversation flow analysis
 * Shared across all visualization scripts
 */

export interface ConversationTurn {
  turnNumber: number;
  userMessage: string;
  orchestrationSteps: number;
  modelInvocations: number;
  toolCalls: string[];
  reasoning: string | null;
  latencyMs: number;
  lambdaError?: {
    message: string;
    stack?: string;
    errorType: string;
  };
}

export interface ToolCallDetail {
  turnNumber: number;
  toolName: string;
  parameters: Record<string, any>;
  result?: any;
}

export interface QualityScore {
  score: number;
  grade: string;
  reason: string;
  weight?: number;
  weightedScore?: number;
}

export interface ErrorDetail {
  turnNumber: number;
  errorType: string;
  message: string;
  toolName: string;
}

export interface ConversationMetrics {
  totalTokens: number;
  totalCost: number;
  totalLatency: number;
  completionRate: number;
  toolSuccessRate: number;
}

export interface ConversationScenario {
  scenarioId: string;
  turns: ConversationTurn[];
  toolCalls: ToolCallDetail[];
  qualityScores: Record<string, QualityScore>;
  metrics: ConversationMetrics;
  errors: ErrorDetail[];
  overallQuality?: {
    recruiter?: { average: number; weightedAverage: number };
    candidate?: { average: number; weightedAverage: number };
    overall?: { average: number; weightedAverage: number };
  };
}

export interface AggregatedMetrics {
  totalScenarios: number;
  avgTurnsPerScenario: number;
  totalToolCalls: number;
  successfulToolCalls: number;
  failedToolCalls: number;
  totalErrors: number;
  avgCandidateExperience: number;
  avgQuestioningStrategy: number;
  totalCost: number;
  totalLatency: number;
  completionRate: number;
}

export interface ProjectConfig {
  project: {
    name: string;
    description: string;
  };
  testPlan: {
    type: string;
  };
  evaluationPlan: {
    qualityAssessment: {
      attributes: string[];
    };
  };
}

export interface ChartOptions {
  title: string;
  subtitle?: string;
  width?: number;
  height?: number;
  showLegend?: boolean;
  colors?: string[];
}

export interface LLMTrace {
  taskLLM: {
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    latencyMs: number;
    timestamp: string;
    agentTrace?: {
      totalSteps: number;
      orchestrationSteps: number;
      modelInvocations: number;
      toolInvocations: number;
      reasoningCaptures: number;
      conversationTurns?: ConversationTurn[];
      toolCallDetails?: ToolCallDetail[];
    };
  };
  judgeLLM: {
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    latencyMs: number;
  };
  total: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    totalLatencyMs: number;
    estimatedCostUSD: number;
  };
}

export interface JudgeEvaluation {
  [attributeName: string]: QualityScore;
  overallQuality?: {
    recruiter?: {
      average: number;
      weightedAverage: number;
    };
    candidate?: {
      average: number;
      weightedAverage: number;
    };
    overall?: {
      average: number;
      weightedAverage: number;
    };
  };
}
