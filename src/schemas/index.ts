/**
 * Schemas Module
 *
 * Exports all Zod schemas and validation utilities
 */

// Version management
export {
  CURRENT_SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  type SupportedSchemaVersion,
  isSupportedVersion,
  isValidSemver,
  validateSchemaVersion,
  type SchemaVersionValidation,
} from './version';

// Config schemas
export {
  TenantConfigSchema,
  type TenantConfig,
  type TestPlan,
  type TextGenerationTestPlan,
  type AgentScenarioTestPlan,
  type AgentSimulationTestPlan,
  type AgentRerunTestPlan,
  type ConversationEvaluationTestPlan,
  type EvaluationPlan,
  type QualityAssessment,
  type LLMConfig,
  type Validators,
  type AgentConfig,
  type CalibrationConfig as CalibrationConfigExtended,
  type LoadedTenantConfig,
} from './config-schema';

// Scenario schemas
export {
  ScenarioSchema,
  AgentScenarioSchema,
  AgentSimulationScenarioSchema,
  type Scenario,
  type AgentScenario,
  type AgentSimulationScenario,
  type CandidateDetails,
  type JobDetails,
  type CompanyDetails,
} from './scenario-schema';

// Calibration schemas
export {
  CalibrationConfigSchema,
  CalibrationExampleSchema,
  type CalibrationConfig,
  type CalibrationExample,
} from './calibration-schema';

// Shared schemas
export {
  ConnectorConfigSchema,
  ConnectorsFileSchema,
  ModelConfigSchema,
  ModelsFileSchema,
  CloudWatchConnectorSchema,
  DynamoDBConnectorSchema,
  PostgreSQLConnectorSchema,
  LocalFileJSONConnectorSchema,
  PromptLibraryConnectorSchema,
  BedrockAgentModelSchema,
  PromptModelSchema,
  type ConnectorConfig,
  type ConnectorsFile,
  type ModelConfig,
  type ModelsFile,
  type CloudWatchConnector,
  type DynamoDBConnector,
  type PostgreSQLConnector,
  type LocalFileJSONConnector,
  type PromptLibraryConnector,
  type BedrockAgentModel,
  type PromptModel,
} from './shared-schema';

// Validation utilities
export {
  validateTenantConfig,
  validateScenario,
  validateCalibration,
  validateConnectors,
  validateModels,
  validateTenant,
  formatValidationResult,
  type ValidationResult,
  type ValidationError,
  type TenantValidationResult,
} from './schema-validator';
