/**
 * LLM Configuration Defaults
 *
 * Centralized default values for LLM configuration parameters across different contexts.
 * Different use cases require different default behavior:
 * - Judge models: Deterministic (temperature=0) for consistent evaluation
 * - Text generation: Balanced (temperature=0.5) for moderate creativity
 * - User simulator: Creative (temperature=0.7) for natural conversation variation
 */

import { LLMConfig } from '../schemas/config-schema';

/**
 * Resolved LLM config with all fields required
 */
export interface ResolvedLLMConfig {
  modelId: string;
  temperature: number;
  topP: number;
  maxTokens: number;
}

/**
 * Default configuration for LLM judge evaluation
 * - temperature: 0 (deterministic for consistent evaluation)
 * - topP: 1.0 (no nucleus sampling restriction)
 * - maxTokens: 4000 (sufficient for detailed evaluation)
 */
export const DEFAULT_JUDGE_CONFIG = {
  temperature: 0,
  topP: 1.0,
  maxTokens: 4000,
} as const;

/**
 * Default configuration for text generation models
 * - temperature: 0.5 (balanced creativity and consistency)
 * - topP: 1.0 (no nucleus sampling restriction)
 * - maxTokens: 4000 (sufficient for most generation tasks)
 */
export const DEFAULT_GENERATOR_CONFIG = {
  temperature: 0.5,
  topP: 1.0,
  maxTokens: 4000,
} as const;

/**
 * Default configuration for user simulator (conversational agent)
 * - temperature: 0.7 (more creative for natural conversation)
 * - topP: 0.9 (nucleus sampling for varied responses)
 * - maxTokens: 500 (shorter responses for chat)
 */
export const DEFAULT_USER_SIMULATOR_CONFIG = {
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 500,
} as const;

/**
 * Apply judge model defaults to LLM configuration
 * @param config Partial LLM configuration
 * @returns Resolved configuration with all fields populated
 */
export function applyJudgeDefaults(config: LLMConfig): ResolvedLLMConfig {
  return {
    modelId: config.modelId,
    temperature: config.temperature ?? DEFAULT_JUDGE_CONFIG.temperature,
    topP: config.topP ?? DEFAULT_JUDGE_CONFIG.topP,
    maxTokens: config.maxTokens ?? DEFAULT_JUDGE_CONFIG.maxTokens,
  };
}

/**
 * Apply text generation defaults to LLM configuration
 * @param config Partial LLM configuration
 * @returns Resolved configuration with all fields populated
 */
export function applyGeneratorDefaults(config: LLMConfig): ResolvedLLMConfig {
  return {
    modelId: config.modelId,
    temperature: config.temperature ?? DEFAULT_GENERATOR_CONFIG.temperature,
    topP: config.topP ?? DEFAULT_GENERATOR_CONFIG.topP,
    maxTokens: config.maxTokens ?? DEFAULT_GENERATOR_CONFIG.maxTokens,
  };
}

/**
 * Apply user simulator defaults to LLM configuration
 * @param config Partial LLM configuration
 * @returns Resolved configuration with all fields populated
 */
export function applyUserSimulatorDefaults(config: LLMConfig): ResolvedLLMConfig {
  return {
    modelId: config.modelId,
    temperature: config.temperature ?? DEFAULT_USER_SIMULATOR_CONFIG.temperature,
    topP: config.topP ?? DEFAULT_USER_SIMULATOR_CONFIG.topP,
    maxTokens: config.maxTokens ?? DEFAULT_USER_SIMULATOR_CONFIG.maxTokens,
  };
}
