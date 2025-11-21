/**
 * Conversation Data Loader
 * Utilities for loading and parsing conversation test artifacts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import {
  ConversationScenario,
  ConversationTurn,
  ToolCallDetail,
  ErrorDetail,
  ConversationMetrics,
  AggregatedMetrics,
  ProjectConfig,
  LLMTrace,
  JudgeEvaluation,
  QualityScore
} from './types';

/**
 * Find the latest timestamped test run folder
 * Pattern: YYYY-MM-DD_HH-MM-SS
 */
export function findLatestTestRun(tenantName: string): string | null {
  const baseDir = path.join(__dirname, '..', '..', 'outputs', tenantName);

  if (!fs.existsSync(baseDir)) {
    console.error(`❌ Directory not found: ${baseDir}`);
    return null;
  }

  const timestampRegex = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;

  const folders = fs.readdirSync(baseDir)
    .filter(name => {
      const fullPath = path.join(baseDir, name);
      return fs.statSync(fullPath).isDirectory() && timestampRegex.test(name);
    })
    .sort()
    .reverse(); // Latest first

  if (folders.length === 0) {
    console.error(`❌ No timestamped test run folders found in: ${baseDir}`);
    return null;
  }

  return path.join(baseDir, folders[0]);
}

/**
 * Load all conversation scenarios from a test run directory
 */
export function loadConversationScenarios(runDir: string): ConversationScenario[] {
  const scenarios: ConversationScenario[] = [];

  if (!fs.existsSync(runDir)) {
    console.error(`❌ Run directory not found: ${runDir}`);
    return scenarios;
  }

  // Find all scenario folders (directories that are not the run folder itself)
  const scenarioFolders = fs.readdirSync(runDir)
    .filter(name => {
      const fullPath = path.join(runDir, name);
      return fs.statSync(fullPath).isDirectory();
    });

  console.log(`📂 Found ${scenarioFolders.length} scenario folders`);

  for (const folder of scenarioFolders) {
    const scenarioDir = path.join(runDir, folder);

    try {
      const scenario = loadSingleScenario(scenarioDir, folder);
      if (scenario) {
        scenarios.push(scenario);
        console.log(`  ✓ Loaded scenario: ${folder}`);
      }
    } catch (error) {
      console.warn(`  ⚠️  Failed to load scenario ${folder}:`, error instanceof Error ? error.message : error);
    }
  }

  return scenarios;
}

/**
 * Load a single scenario from its directory
 */
function loadSingleScenario(scenarioDir: string, scenarioId: string): ConversationScenario | null {
  // Required files
  const traceFile = path.join(scenarioDir, '6-llm-trace.yaml');
  const judgeFile = path.join(scenarioDir, '4-judge-evaluation.yaml');

  if (!fs.existsSync(traceFile)) {
    console.warn(`    Missing 6-llm-trace.yaml for ${scenarioId}`);
    return null;
  }

  if (!fs.existsSync(judgeFile)) {
    console.warn(`    Missing 4-judge-evaluation.yaml for ${scenarioId}`);
    return null;
  }

  // Load YAML files
  const traceContent = fs.readFileSync(traceFile, 'utf-8');
  const trace = yaml.load(traceContent) as LLMTrace;

  const judgeContent = fs.readFileSync(judgeFile, 'utf-8');
  const judge = yaml.load(judgeContent) as JudgeEvaluation;

  // Extract conversation turns
  const turns = trace.taskLLM?.agentTrace?.conversationTurns || [];

  // Extract tool call details
  const toolCalls = trace.taskLLM?.agentTrace?.toolCallDetails || [];

  // Extract errors from turns
  const errors = extractErrors(turns);

  // Calculate metrics
  const metrics = calculateMetrics(trace, toolCalls, turns);

  // Extract quality scores and overallQuality
  const qualityScores: Record<string, QualityScore> = {};
  let overallQuality: any = undefined;

  for (const [key, value] of Object.entries(judge)) {
    if (key === 'overallQuality') {
      overallQuality = value;
    } else if (typeof value === 'object' && value !== null) {
      qualityScores[key] = value as QualityScore;
    }
  }

  return {
    scenarioId,
    turns,
    toolCalls,
    qualityScores,
    metrics,
    errors,
    overallQuality
  };
}

/**
 * Extract error details from conversation turns
 */
function extractErrors(turns: ConversationTurn[]): ErrorDetail[] {
  const errors: ErrorDetail[] = [];

  for (const turn of turns) {
    if (turn.lambdaError) {
      errors.push({
        turnNumber: turn.turnNumber,
        errorType: turn.lambdaError.errorType,
        message: turn.lambdaError.message,
        toolName: turn.toolCalls && turn.toolCalls.length > 0 ? turn.toolCalls[0] : 'unknown'
      });
    }
  }

  return errors;
}

/**
 * Calculate conversation metrics from trace data
 */
function calculateMetrics(
  trace: LLMTrace,
  toolCalls: ToolCallDetail[],
  turns: ConversationTurn[]
): ConversationMetrics {

  // Calculate tool success rate
  const totalToolCalls = toolCalls.length;
  const successfulCalls = toolCalls.filter(tc => tc.result !== undefined && tc.result !== null).length;
  const toolSuccessRate = totalToolCalls > 0 ? (successfulCalls / totalToolCalls) * 100 : 0;

  // Check for Lambda errors
  const hasErrors = turns.some(t => t.lambdaError !== undefined);
  const completionRate = hasErrors ? 0 : 100; // Simple heuristic

  return {
    totalTokens: trace.total?.totalTokens || 0,
    totalCost: trace.total?.estimatedCostUSD || 0,
    totalLatency: trace.total?.totalLatencyMs || 0,
    completionRate,
    toolSuccessRate
  };
}

/**
 * Load project configuration from tenant config.yaml
 */
export function loadProjectConfig(tenantName: string): ProjectConfig {
  const configPath = path.join(__dirname, '..', '..', 'tenants', tenantName, 'config.yaml');

  if (!fs.existsSync(configPath)) {
    // Return default config if file not found
    return {
      project: {
        name: tenantName,
        description: 'Conversation AI Agent Test'
      },
      testPlan: {
        type: 'agent-simulation'
      },
      evaluationPlan: {
        qualityAssessment: {
          attributes: []
        }
      }
    };
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  return yaml.load(content) as ProjectConfig;
}

/**
 * Aggregate metrics across all scenarios
 */
export function aggregateMetrics(scenarios: ConversationScenario[]): AggregatedMetrics {
  if (scenarios.length === 0) {
    return {
      totalScenarios: 0,
      avgTurnsPerScenario: 0,
      totalToolCalls: 0,
      successfulToolCalls: 0,
      failedToolCalls: 0,
      totalErrors: 0,
      avgCandidateExperience: 0,
      avgQuestioningStrategy: 0,
      totalCost: 0,
      totalLatency: 0,
      completionRate: 0
    };
  }

  const totalTurns = scenarios.reduce((sum, s) => sum + s.turns.length, 0);
  const totalToolCalls = scenarios.reduce((sum, s) => sum + s.toolCalls.length, 0);
  const totalErrors = scenarios.reduce((sum, s) => sum + s.errors.length, 0);
  const totalCost = scenarios.reduce((sum, s) => sum + s.metrics.totalCost, 0);
  const totalLatency = scenarios.reduce((sum, s) => sum + s.metrics.totalLatency, 0);

  // Calculate successful tool calls (those without Lambda errors)
  let successfulToolCalls = 0;
  for (const scenario of scenarios) {
    const errorTurns = new Set(scenario.errors.map(e => e.turnNumber));
    successfulToolCalls += scenario.toolCalls.filter(tc => !errorTurns.has(tc.turnNumber)).length;
  }

  const failedToolCalls = totalToolCalls - successfulToolCalls;

  // Calculate average quality scores
  let candidateExperienceSum = 0;
  let candidateExperienceCount = 0;
  let questioningStrategySum = 0;
  let questioningStrategyCount = 0;

  for (const scenario of scenarios) {
    if (scenario.qualityScores['CandidateExperience']) {
      candidateExperienceSum += scenario.qualityScores['CandidateExperience'].score;
      candidateExperienceCount++;
    }
    if (scenario.qualityScores['QuestioningStrategy']) {
      questioningStrategySum += scenario.qualityScores['QuestioningStrategy'].score;
      questioningStrategyCount++;
    }
  }

  const avgCandidateExperience = candidateExperienceCount > 0
    ? candidateExperienceSum / candidateExperienceCount
    : 0;

  const avgQuestioningStrategy = questioningStrategyCount > 0
    ? questioningStrategySum / questioningStrategyCount
    : 0;

  // Calculate completion rate
  const completedScenarios = scenarios.filter(s => s.metrics.completionRate === 100).length;
  const completionRate = (completedScenarios / scenarios.length) * 100;

  return {
    totalScenarios: scenarios.length,
    avgTurnsPerScenario: totalTurns / scenarios.length,
    totalToolCalls,
    successfulToolCalls,
    failedToolCalls,
    totalErrors,
    avgCandidateExperience,
    avgQuestioningStrategy,
    totalCost,
    totalLatency,
    completionRate
  };
}

/**
 * Get all unique quality attribute names across scenarios
 */
export function getUniqueQualityAttributes(scenarios: ConversationScenario[]): string[] {
  const attributeSet = new Set<string>();

  for (const scenario of scenarios) {
    for (const attr of Object.keys(scenario.qualityScores)) {
      attributeSet.add(attr);
    }
  }

  return Array.from(attributeSet).sort();
}

/**
 * Get all unique tool names across scenarios
 */
export function getUniqueToolNames(scenarios: ConversationScenario[]): string[] {
  const toolSet = new Set<string>();

  for (const scenario of scenarios) {
    for (const tool of scenario.toolCalls) {
      toolSet.add(tool.toolName);
    }
  }

  return Array.from(toolSet).sort();
}

/**
 * Stage distribution for conversation flow analysis
 */
export interface StageDistribution {
  Initial: number;
  Screening: number;
  Requirements: number;
  Consent: number;
  Rejected: number;
}

/**
 * Analyze conversation stages based on tool call patterns
 * Now supports both specific tool names and generic tool names with position-based fallback
 */
export function analyzeConversationStages(
  scenarios: ConversationScenario[]
): StageDistribution {
  const STAGE_TOOLS = {
    Initial: ['askuser'],  // Only turn 1
    Screening: [
      'Update_Role_Title_Employer',
      'Update_Salary_Expectation',
      'Update_Notice_Period',
      'Update_Right_To_Work'
    ],
    Requirements: ['askuser'],  // After screening
    Consent: [
      'Update_Candidate_Consent',
      'Queue_To_Send'
    ],
    Rejected: ['Candidate_Rejected']
  };

  const distribution: StageDistribution = {
    Initial: 0,
    Screening: 0,
    Requirements: 0,
    Consent: 0,
    Rejected: 0
  };

  for (const scenario of scenarios) {
    for (let i = 0; i < scenario.turns.length; i++) {
      const turn = scenario.turns[i];
      const toolCalls = turn.toolCalls || [];
      const hasToolCalls = toolCalls.length > 0;

      // Check for rejected first (highest priority)
      if (toolCalls.includes('Candidate_Rejected')) {
        distribution.Rejected++;
        continue;
      }

      // Turn 1 with askuser = Initial
      if (i === 0 && toolCalls.includes('askuser')) {
        distribution.Initial++;
        continue;
      }

      // Turn 1 without askuser but with any tool calls = Initial (fallback)
      if (i === 0 && hasToolCalls) {
        distribution.Initial++;
        continue;
      }

      // Screening tools (specific names)
      if (toolCalls.some(t => STAGE_TOOLS.Screening.includes(t))) {
        distribution.Screening++;
        continue;
      }

      // Consent tools (specific names)
      if (toolCalls.some(t => STAGE_TOOLS.Consent.includes(t))) {
        distribution.Consent++;
        continue;
      }

      // askuser after turn 1 = Requirements
      if (toolCalls.includes('askuser')) {
        distribution.Requirements++;
        continue;
      }

      // FALLBACK LOGIC: When tool names are generic (e.g., "candidate_outreach")
      // Use turn position to infer stage
      if (hasToolCalls) {
        // Turns 2-5 with tool calls = Screening phase
        // (typically: job title, salary, notice period, right to work)
        if (i >= 1 && i <= 4) {
          distribution.Screening++;
          continue;
        }

        // Turns 6-7 with tool calls = Requirements phase
        // (asking follow-up questions)
        if (i >= 5 && i <= 6) {
          distribution.Requirements++;
          continue;
        }

        // Turn 8+ with tool calls = Consent phase
        // (getting consent, queuing message)
        if (i >= 7) {
          distribution.Consent++;
          continue;
        }
      }

      // Default: turns without tool calls go to Requirements
      // (agent thinking/responding without actions)
      distribution.Requirements++;
    }
  }

  return distribution;
}

/**
 * Get candidate reference score from judge evaluation
 */
export function getCandidateReferenceScore(
  scenarios: ConversationScenario[]
): number | null {
  // Try to find candidate score from first scenario with the data
  for (const scenario of scenarios) {
    if (scenario.overallQuality?.candidate?.weightedAverage) {
      return scenario.overallQuality.candidate.weightedAverage;
    }
  }

  return null;
}

/**
 * Generate metrics JSON containing aggregated and per-scenario data
 * This JSON can be used to reproduce all diagrams
 */
export function generateMetricsJson(
  scenarios: ConversationScenario[],
  aggregated: AggregatedMetrics
): object {
  return {
    summary: {
      totalScenarios: aggregated.totalScenarios,
      avgTurnsPerScenario: aggregated.avgTurnsPerScenario,
      totalToolCalls: aggregated.totalToolCalls,
      successfulToolCalls: aggregated.successfulToolCalls,
      failedToolCalls: aggregated.failedToolCalls,
      totalErrors: aggregated.totalErrors,
      avgCandidateExperience: aggregated.avgCandidateExperience,
      avgQuestioningStrategy: aggregated.avgQuestioningStrategy,
      totalCost: aggregated.totalCost,
      totalLatency: aggregated.totalLatency,
      completionRate: aggregated.completionRate
    },
    scenarios: scenarios.map(s => {
      const distribution = analyzeConversationStages([s]);
      const totalTurns = s.turns.length;

      return {
        scenarioId: s.scenarioId,
        qualityScores: s.qualityScores,
        stageDistribution: {
          counts: distribution,
          percentages: {
            Initial: totalTurns > 0 ? (distribution.Initial / totalTurns) * 100 : 0,
            Screening: totalTurns > 0 ? (distribution.Screening / totalTurns) * 100 : 0,
            Requirements: totalTurns > 0 ? (distribution.Requirements / totalTurns) * 100 : 0,
            Consent: totalTurns > 0 ? (distribution.Consent / totalTurns) * 100 : 0,
            Rejected: totalTurns > 0 ? (distribution.Rejected / totalTurns) * 100 : 0
          }
        },
        costs: {
          totalCost: s.metrics.totalCost,
          totalLatency: s.metrics.totalLatency,
          totalTokens: s.metrics.totalTokens,
          costPerTurn: totalTurns > 0 ? s.metrics.totalCost / totalTurns : 0,
          costPerSuccess: s.metrics.completionRate === 100 ? s.metrics.totalCost : 0,
          stageCosts: {
            Initial: totalTurns > 0 ? (distribution.Initial / totalTurns) * s.metrics.totalCost : 0,
            Screening: totalTurns > 0 ? (distribution.Screening / totalTurns) * s.metrics.totalCost : 0,
            Requirements: totalTurns > 0 ? (distribution.Requirements / totalTurns) * s.metrics.totalCost : 0,
            Consent: totalTurns > 0 ? (distribution.Consent / totalTurns) * s.metrics.totalCost : 0,
            Rejected: totalTurns > 0 ? (distribution.Rejected / totalTurns) * s.metrics.totalCost : 0
          }
        },
        performanceMetrics: {
          completionRate: s.metrics.completionRate,
          toolSuccessRate: s.metrics.toolSuccessRate,
          totalTurns: totalTurns,
          totalToolCalls: s.toolCalls.length,
          totalErrors: s.errors.length
        },
        overallQuality: s.overallQuality
      };
    })
  };
}
