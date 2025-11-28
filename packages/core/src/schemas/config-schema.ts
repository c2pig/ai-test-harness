import { z } from 'zod';
import { SUPPORTED_SCHEMA_VERSIONS } from './version';

const ProjectSchema = z.object({
  name: z.string().min(1, 'project name is required'),
  description: z.string().min(1, 'project description is required'),
});

// Optional fields default to: Judge (0, 1.0, 4000), Generator (0.5, 1.0, 4000), UserSim (0.7, 0.9, 500)
const LLMConfigSchema = z.object({
  modelId: z.string().min(1, 'modelId is required'),
  temperature: z.number().min(0).max(1, 'temperature must be between 0 and 1').optional(),
  topP: z.number().min(0).max(1, 'topP must be between 0 and 1').optional(),
  maxTokens: z.number().int().positive('maxTokens must be a positive integer').optional(),
});

const QualityAssessmentSchema = z.object({
  attributes: z.array(z.string()).min(1, 'at least one quality attribute is required'),
  solutionDescription: z.string().min(1, 'solutionDescription is required'),
  calibrationPath: z.string().optional(),
});

const EvaluationPlanSchema = z.object({
  judgeModel: LLMConfigSchema,
  qualityAssessment: QualityAssessmentSchema,
  region: z.string().optional(),
});

const ToolCallValidatorSchema = z.array(z.string()).min(1);

const NumericRangeSchema = z
  .object({
    lt: z.number().optional(),
    gt: z.number().optional(),
  })
  .refine(data => data.lt !== undefined || data.gt !== undefined, {
    message: 'at least one of "lt" or "gt" must be specified',
  });

const ValidatorsSchema = z
  .object({
    toolCalls: ToolCallValidatorSchema.optional(),
    cost: NumericRangeSchema.optional(),
    latencyMs: NumericRangeSchema.optional(),
  })
  .optional();

const ExpectedToolCallSchema = z.object({
  name: z.string().min(1, 'tool call name is required'),
  triggerCondition: z.string().min(1, 'triggerCondition is required'),
});

const UserSimulatorSchema = z.object({
  modelId: z.string().min(1, 'modelId is required'),
  temperature: z.number().min(0).max(1).optional(),
  topP: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().positive().optional(),
});

const ConversationControlSchema = z.object({
  maxTurns: z.number().int().positive('maxTurns must be a positive integer'),
});

const BaseTestPlanSchema = z.object({
  type: z.enum([
    'text-generation',
    'agent-scenario',
    'agent-simulation',
    'agent-rerun',
    'conversation-evaluation',
  ]),
  sampleSize: z.number().int().positive('sampleSize must be a positive integer').optional(),
  region: z.string().optional(),
});

const TextGenerationTestPlanSchema = BaseTestPlanSchema.extend({
  type: z.literal('text-generation'),
  prompt: z.string().min(1, 'prompt reference is required'),
  llmConfig: z.union([
    LLMConfigSchema,
    z
      .array(LLMConfigSchema)
      .min(1, 'at least one model is required')
      .max(5, 'maximum 5 models allowed for comparison'),
  ]),
  connectors: z.record(z.string(), z.string()).optional(),
  batchSize: z
    .number()
    .int()
    .min(1, 'batchSize must be at least 1')
    .max(4, 'batchSize must not exceed 4')
    .optional(),
});

const AgentScenarioTestPlanSchema = BaseTestPlanSchema.extend({
  type: z.literal('agent-scenario'),
  agent: z.string().min(1, 'agent reference is required'),
  scenariosPath: z.string().min(1, 'scenariosPath is required'),
  connectors: z.record(z.string(), z.string()).optional(),
});

const AgentSimulationTestPlanSchema = BaseTestPlanSchema.extend({
  type: z.literal('agent-simulation'),
  agent: z.string().min(1, 'agent reference is required'),
  scenariosPath: z.string().min(1, 'scenariosPath is required'),
  userSimulator: UserSimulatorSchema,
  conversationControl: ConversationControlSchema,
  connectors: z.record(z.string(), z.string()).optional(),
  batchSize: z
    .number()
    .int()
    .min(1, 'batchSize must be at least 1')
    .max(4, 'batchSize must not exceed 4')
    .optional(),
});

const AgentRerunTestPlanSchema = BaseTestPlanSchema.extend({
  type: z.literal('agent-rerun'),
  agent: z.string().min(1, 'agent reference is required'),
  expectedToolCalls: z
    .array(ExpectedToolCallSchema)
    .min(1, 'at least one expected tool call is required'),
  connectors: z
    .record(z.string(), z.string())
    .refine(connectors => Object.keys(connectors).length >= 1, {
      message: 'at least one connector is required (e.g., DynamoDB for conversation history)',
    }),
});

const ConversationEvaluationTestPlanSchema = BaseTestPlanSchema.extend({
  type: z.literal('conversation-evaluation'),
  agent: z.string().min(1, 'agent reference is required'),
  expectedToolCalls: z
    .array(ExpectedToolCallSchema)
    .min(1, 'at least one expected tool call is required'),
  connectors: z
    .record(z.string(), z.string())
    .refine(connectors => Object.keys(connectors).length >= 1, {
      message: 'at least one connector is required (e.g., DynamoDB for conversation history)',
    }),
});

const TestPlanSchema = z.discriminatedUnion('type', [
  TextGenerationTestPlanSchema,
  AgentScenarioTestPlanSchema,
  AgentSimulationTestPlanSchema,
  AgentRerunTestPlanSchema,
  ConversationEvaluationTestPlanSchema,
]);

export const TenantConfigSchema = z.object({
  schemaVersion: z.enum(SUPPORTED_SCHEMA_VERSIONS as unknown as [string, ...string[]]),
  project: ProjectSchema,
  testPlan: TestPlanSchema,
  evaluationPlan: EvaluationPlanSchema,
  validators: ValidatorsSchema,
});

export type TenantConfig = z.infer<typeof TenantConfigSchema>;
export type TestPlan = z.infer<typeof TestPlanSchema>;
export type TextGenerationTestPlan = z.infer<typeof TextGenerationTestPlanSchema>;
export type AgentScenarioTestPlan = z.infer<typeof AgentScenarioTestPlanSchema>;
export type AgentSimulationTestPlan = z.infer<typeof AgentSimulationTestPlanSchema>;
export type AgentRerunTestPlan = z.infer<typeof AgentRerunTestPlanSchema>;
export type ConversationEvaluationTestPlan = z.infer<typeof ConversationEvaluationTestPlanSchema>;
export type EvaluationPlan = z.infer<typeof EvaluationPlanSchema>;
export type QualityAssessment = z.infer<typeof QualityAssessmentSchema>;
export type LLMConfig = z.infer<typeof LLMConfigSchema>;
export type Validators = z.infer<typeof ValidatorsSchema>;

// Runtime-injected types
export interface AgentConfig {
  type: 'bedrock-agent';
  agentId: string;
  agentAliasId: string;
  region: string;
  foundationModel?: string;
}

export interface CalibrationConfig {
  enabled: boolean;
  examples: any[];
}

export type LoadedTenantConfig = TenantConfig & {
  validatorInstances?: any[];
  evaluationPlan: EvaluationPlan & {
    qualityAssessment: QualityAssessment & {
      calibration?: CalibrationConfig;
    };
  };
  testPlan: TestPlan &
    (
      | { type: 'text-generation' }
      | { type: 'agent-scenario'; agentConfig?: AgentConfig; scenarios?: any[] }
      | { type: 'agent-simulation'; agentConfig?: AgentConfig; scenarios?: any[] }
      | { type: 'agent-rerun'; agentConfig?: AgentConfig }
      | { type: 'conversation-evaluation'; agentConfig?: AgentConfig }
    );
};
