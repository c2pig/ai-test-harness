/**
 * Scenario Configuration Schemas
 *
 * Zod schemas for scenario.yaml files
 * Supports two types: agent-scenario (scripted) and agent-simulation (dynamic)
 */

import { z } from 'zod';

// ============================================================================
// Common Scenario Fields
// ============================================================================

/**
 * Base scenario fields shared across all scenario types
 */
const BaseScenarioSchema = z.object({
  /**
   * Unique identifier for the scenario
   */
  scenarioId: z.string().min(1, 'scenarioId is required'),

  /**
   * Human-readable description of the scenario
   */
  description: z.string().min(1, 'description is required'),
});

// ============================================================================
// Agent Scenario (Scripted Conversations)
// ============================================================================

/**
 * Validation configuration for scenario outcomes
 */
const ScenarioValidationSchema = z.object({
  /**
   * Whether escalation should occur in this scenario
   */
  escalation: z.boolean(),

  /**
   * Type of escalation if applicable
   */
  escalationType: z.string().optional(),
});

/**
 * Agent scenario configuration (scripted conversation)
 * Used with testPlan.type: "agent-scenario"
 */
export const AgentScenarioSchema = BaseScenarioSchema.extend({
  /**
   * Scripted conversation turns (user messages)
   */
  conversationExamples: z
    .array(
      z.object({
        user: z.string().min(1, 'user message cannot be empty'),
      })
    )
    .min(1, 'conversationExamples must have at least one message'),

  /**
   * Expected validation outcomes
   */
  validations: ScenarioValidationSchema,

  /**
   * Acceptance criteria for test success
   */
  acceptanceCriteria: z
    .array(z.string())
    .min(1, 'acceptanceCriteria must have at least one criterion'),

  /**
   * Optional context data to provide to the agent
   */
  contextData: z.record(z.string(), z.any()).optional(),

  /**
   * Optional hardcoded sessionId (overrides random generation)
   */
  sessionId: z.string().optional(),
});

// ============================================================================
// Agent Simulation (Dynamic Conversations)
// ============================================================================

/**
 * Candidate experience entry
 */
const ExperienceSchema = z
  .object({
    company: z.string(),
    role: z.string(),
    duration: z.string(),
    responsibilities: z.array(z.string()).optional(),
  })
  .passthrough(); // Allow additional fields like endDate, reason, etc.

/**
 * Candidate details for simulation
 */
const CandidateDetailsSchema = z
  .object({
    fullName: z.string(),
    email: z.string().email('Invalid email format').optional(),
    recommendationId: z.number().int().positive().optional(),
    appliedRole: z.string().optional(),
    experience: z.array(ExperienceSchema).optional(),
    skills: z.array(z.string()).optional(),
    education: z.string().optional(),
    location: z.string().optional(),
  })
  .passthrough(); // Allow additional fields for flexibility

/**
 * Job details for simulation context
 */
const JobDetailsSchema = z
  .object({
    title: z.string(),
    description: z.string().optional(),
    requirements: z.array(z.string()).optional(),
    location: z.string().optional(),
    salary: z.string().optional(),
  })
  .passthrough(); // Allow additional fields for flexibility

/**
 * Company details for simulation context
 */
const CompanyDetailsSchema = z
  .object({
    name: z.string(),
    industry: z.string().optional(),
    description: z.string().optional(),
    size: z.string().optional(),
  })
  .passthrough(); // Allow additional fields for flexibility

/**
 * Agent simulation configuration (dynamic conversation with LLM user)
 * Used with testPlan.type: "agent-simulation"
 */
export const AgentSimulationScenarioSchema = BaseScenarioSchema.extend({
  /**
   * User simulator persona traits
   * Defines how the simulated user should behave
   */
  persona: z.array(z.string()).min(1, 'persona must have at least one trait'),

  /**
   * Example conversation turns for user simulator reference
   */
  conversationExamples: z
    .array(
      z.object({
        user: z.string().optional(),
        assistant: z.string().optional(),
      })
    )
    .optional(),

  /**
   * DEPRECATED: Candidate details (factual background data for user simulator)
   * Use contextData.candidate instead
   */
  candidateDetails: CandidateDetailsSchema.optional(),

  /**
   * Context data with asymmetric information
   * - candidate: What the candidate (LLM simulator) knows
   * - agent: What the agent/recruiter knows
   */
  contextData: z
    .union([
      // New structure with asymmetric information
      z
        .object({
          candidate: CandidateDetailsSchema.optional(),
          agent: z
            .object({
              candidate: CandidateDetailsSchema.optional(),
              job: JobDetailsSchema.optional(),
              company: CompanyDetailsSchema.optional(),
            })
            .passthrough()
            .optional(), // Allow additional fields in agent context
        })
        .passthrough(), // Allow additional fields at contextData level
      // Legacy structure for backward compatibility
      z
        .object({
          candidateDetails: CandidateDetailsSchema.optional(),
          jobDetails: JobDetailsSchema.optional(),
          companyDetails: CompanyDetailsSchema.optional(),
        })
        .passthrough(), // Allow additional fields for backward compatibility
    ])
    .optional(),

  /**
   * Acceptance criteria for test success
   */
  acceptanceCriteria: z.array(z.string()).optional(),

  /**
   * Expected validation outcomes
   */
  validations: ScenarioValidationSchema.optional(),

  /**
   * Optional hardcoded sessionId (overrides random generation)
   */
  sessionId: z.string().optional(),
});

// ============================================================================
// Unified Scenario Schema
// ============================================================================

/**
 * Unified scenario schema
 * Validates against both agent-scenario and agent-simulation types
 */
export const ScenarioSchema = z.union([AgentScenarioSchema, AgentSimulationScenarioSchema]);

// ============================================================================
// Type Exports
// ============================================================================

export type AgentScenario = z.infer<typeof AgentScenarioSchema>;
export type AgentSimulationScenario = z.infer<typeof AgentSimulationScenarioSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type CandidateDetails = z.infer<typeof CandidateDetailsSchema>;
export type JobDetails = z.infer<typeof JobDetailsSchema>;
export type CompanyDetails = z.infer<typeof CompanyDetailsSchema>;
