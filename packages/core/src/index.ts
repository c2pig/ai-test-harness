/**
 * @ai-test-harness/core
 *
 * Core framework for AI quality testing.
 * Provides the test runners, LLM clients, quality attributes, and utilities.
 */

// ============================================================================
// Test Runners
// ============================================================================
export { TestRunner } from './core/TestRunner';
export { AgentTestRunner } from './core/AgentTestRunner';
export { AgentSimulationRunner } from './core/AgentSimulationRunner';
export { AgentRerunRunner } from './core/AgentRerunRunner';
export { AgentReplayTestRunner } from './core/AgentReplayTestRunner';
export { ConversationEvaluationRunner } from './core/ConversationEvaluationRunner';
export { BaseRunner } from './core/BaseRunner';

// ============================================================================
// LLM Components
// ============================================================================
export { LLMJudge } from './core/LLMJudge';
export type { LLMJudgeMetrics, EvaluateResult } from './core/LLMJudge';

export { LLMGenerator } from './core/LLMGenerator';
export type { LLMGeneratorMetrics, GenerateResult } from './core/LLMGenerator';

export { UserSimulator } from './core/UserSimulator';
export type {
  UserSimulatorConfig,
  UserSimulatorMetrics,
  UserResponse,
  ConversationMessage,
  ScenarioContext,
} from './core/UserSimulator';

// ============================================================================
// LLM Client Abstraction
// ============================================================================
export {
  // Types
  type ILLMClient,
  type ChatRequest,
  type ChatResponse,
  type ChatMessage,
  type LLMProvider,
  type LLMClientConfig,
  // Factory
  LLMClientFactory,
  // Adapters
  BedrockAdapter,
  LiteLLMAdapter,
  MockAdapter,
  // Utilities
  getModelFamily,
  cleanModelId,
  buildRequestBody,
  parseResponse,
  type ModelFamily,
  type InferenceConfig,
  type LLMResponse,
} from './llm';

// ============================================================================
// Quality Library
// ============================================================================
export {
  // Registry
  getAttributeDefinition,
  getAttributeDefinitions,
  getAvailableAttributes,
  validateAttributeNames,
  QualityAttributeRegistry,
  // Prompt Generation
  generateAssessmentPrompt,
  // Schema Building
  buildQualityAssessmentSchema,
  generateCapabilitiesDescription,
  generateSchemaShape,
  // Types
  type QualityAttributeDefinition,
  type QualityAttributeConfig,
  type CalibrationExample,
  type CalibrationConfig,
  type AttributeValidationResult,
} from './quality-library';

// ============================================================================
// Connectors
// ============================================================================
export { ConnectorFactory } from './connectors/ConnectorFactory';
export type { IConnector, ConnectorConfig } from './connectors/types';

// ============================================================================
// Validators
// ============================================================================
export {
  // Tool call validators
  ToolCallValidator,
  ExpectedToolCallValidator,
  ConversationToolValidator,
  // Other validators
  CostValidator,
  LatencyValidator,
  // Factory
  createValidators,
  // Types
  type ExpectedToolCall,
  type ExpectedToolCallConfig,
  type ExpectedToolCallResult,
  type ConversationToolResult,
  type ToolCallValidatorConfig,
  type CostValidatorConfig,
  type LatencyValidatorConfig,
  type BaseValidator,
  type ValidationContext,
  type ValidationResult as ValidatorResult,
} from './validators';

// ============================================================================
// Schemas & Validation
// ============================================================================
export {
  // Config schemas
  TenantConfigSchema,
  type TenantConfig,
  type TestPlan,
  type EvaluationPlan,
  type LoadedTenantConfig,
  type LLMConfig,
  // Validation functions
  validateTenantConfig,
  validateScenario,
  validateCalibration,
  validateConnectors,
  validateModels,
  formatValidationResult,
  type ValidationResult as SchemaValidationResult,
  type ValidationError,
  // Version
  CURRENT_SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
} from './schemas';

// ============================================================================
// Utilities
// ============================================================================
export { Logger } from './utils/logger';
export { ConfigLoader } from './utils/ConfigLoader';
export { retryWithBackoff } from './utils/retry';

// ============================================================================
// Main Entry Point
// ============================================================================
export { runTests, validateProject } from './runner';
export type {
  RunTestsOptions,
  RunTestsResult,
  ValidationResult as ProjectValidationResult,
} from './runner';
