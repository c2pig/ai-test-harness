/**
 * Artifact Types
 *
 * Shared interfaces for test artifacts, LLM stats, and benchmark metadata.
 */

export interface LLMStats {
  taskLLM: {
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    latencyMs: number;
    timestamp: string;
    inferenceConfig?: {
      temperature?: number;
      topP?: number;
      topK?: number;
      maxTokens?: number;
    };
    agentTrace?: {
      totalSteps: number;
      orchestrationSteps: number;
      modelInvocations: number;
      toolInvocations: number;
      reasoningCaptures: number;
      conversationTurns?: Array<{
        turnNumber: number;
        userMessage: string;
        orchestrationSteps: number;
        modelInvocations: number;
        toolCalls: string[];
        reasoning: string | null;
        latencyMs: number;
      }>;
      toolCallDetails?: Array<{
        turnNumber: number;
        toolName: string;
        parameters: Record<string, any>;
        result: any;
      }>;
      reasoningSummary?: string[];
    };
    conversationMetrics?: any;
    agentId?: string;
    agentAliasId?: string;
    instruction?: string;
  };
  judgeLLM: {
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    latencyMs: number;
    timestamp: string;
    attempts: number;
    validationPassed: boolean;
    inferenceConfig?: {
      temperature?: number;
      topP?: number;
      topK?: number;
      maxTokens?: number;
    };
  };
  total: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    totalLatencyMs: number;
    estimatedCostUSD: number;
  };
  toolValidation?: any;
  userSimulator?: any;
}

export interface TestArtifact {
  recommendationId: string;
  testId?: string;
  testDescription?: string;
  timestamp?: string;
  inputs: Record<string, any>;
  taskPrompt?: string;
  generatedOutput: string;
  rawOutput: string;
  judgePrompt: string;
  judgeResponse: any;
  assessment: any;
  llmStats: LLMStats;
  agentPrompt?: string;
  conversationMetadata?: any;
  summary?: string;
  scoreBreakdown?: {
    byCategory?: Record<string, { average: number; weightedAverage: number }>;
    overall?: { average: number; weightedAverage: number };
  };
}

export interface ModelConfig {
  modelId: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

export interface AgentConfig {
  agentId: string;
  agentAlias: string;
  foundationModel: string;
}

export interface BenchmarkMetadata {
  testRun: {
    tenant: string;
    testType: string;
    timestamp: string;
    environment?: string;
  };
  model: {
    agent?: AgentConfig;
    task?: ModelConfig;
    judge: ModelConfig;
    userSimulator?: any;
  };
  prompt: {
    promptPath: string;
    contentHash: string;
  };
  evaluation: {
    qualityAttributes: string[];
    calibrationEnabled: boolean;
    judgeConfig: ModelConfig;
  };
}

