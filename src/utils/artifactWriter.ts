import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Logger } from './logger';
import { calculateCost } from './pricing';

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
    conversationMetrics?: any; // Optional conversation metrics for conversation-evaluation
    agentId?: string; // Optional agent ID for agent-simulation
    agentAliasId?: string; // Optional agent alias ID for agent-simulation
    instruction?: string; // Optional agent instruction for agent-simulation
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
  toolValidation?: any; // Optional tool validation results from config.expectedToolCalls
  userSimulator?: any; // Optional user simulator config for agent-simulation
}

export interface TestArtifact {
  recommendationId: string;
  testId?: string; // Optional testId for agent-simulation tests
  testDescription?: string; // Optional test description for error scenarios
  timestamp?: string; // Optional for agent-simulation tests
  inputs: Record<string, any>; // Phase 2: Dynamic input fields
  taskPrompt?: string; // Optional for agent-simulation tests (uses agentPrompt instead)
  generatedOutput: string;
  rawOutput: string; // Immutable snapshot of exact LLM response (guaranteed zero processing)
  judgePrompt: string;
  judgeResponse: any;
  assessment: any;
  llmStats: LLMStats;
  agentPrompt?: string; // Optional agent prompt for agent-simulation tests
  conversationMetadata?: any; // Optional conversation metadata for agent-simulation tests
  summary?: string; // Optional summary for agent-simulation tests
  scoreBreakdown?: {
    byCategory?: Record<string, { average: number; weightedAverage: number }>;
    overall?: { average: number; weightedAverage: number };
  };
}

// Benchmark metadata interfaces
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
    userSimulator?: any; // Optional user simulator config for agent-simulation
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

export class ArtifactWriter {
  private outputDir: string;
  private runDir: string;
  private testType: string;

  constructor(outputDir: string, runTimestamp: string, testType: string) {
    this.outputDir = outputDir;
    this.runDir = path.join(outputDir, runTimestamp);
    this.testType = testType;
    this.ensureOutputDirectory();
  }

  /**
   * Get type prefix for file naming: "conversation", "agent", or "llm"
   */
  private getTypePrefix(): string {
    if (this.testType === 'conversation-evaluation') {
      return 'conversation';
    }
    if (
      this.testType === 'agent-simulation' ||
      this.testType === 'agent-rerun' ||
      this.testType === 'agent-scenario'
    ) {
      return 'agent';
    }
    return 'llm';
  }

  private ensureOutputDirectory(): void {
    if (!fs.existsSync(this.runDir)) {
      fs.mkdirSync(this.runDir, { recursive: true });
      Logger.info(`[ArtifactWriter] Created run directory: ${this.runDir}`);
    }
  }

  async writeArtifact(
    artifact: TestArtifact,
    modelAlias?: string,
    isMultiModel?: boolean,
    modelConfig?: ModelConfig
  ): Promise<void> {
    if (isMultiModel && modelAlias && modelConfig) {
      await this.writeMultiModelArtifact(artifact, modelAlias, modelConfig);
    } else {
      await this.writeSingleModelArtifact(artifact);
    }
  }

  /**
   * Write artifacts for single-model test (backward compatible, existing logic)
   */
  private async writeSingleModelArtifact(artifact: TestArtifact): Promise<void> {
    const matchDir = path.join(this.runDir, artifact.recommendationId);
    const typePrefix = this.getTypePrefix();

    // Create directory for this match
    if (!fs.existsSync(matchDir)) {
      fs.mkdirSync(matchDir, { recursive: true });
    }

    // Write input sources to YAML file
    const inputSourcesPath = path.join(matchDir, `1-input-sources-to-${typePrefix}.yaml`);
    const inputData = {
      scenarioId: artifact.recommendationId,
      ...artifact.inputs,
    };
    fs.writeFileSync(
      inputSourcesPath,
      yaml.dump(inputData, { lineWidth: -1, noRefs: true }),
      'utf-8'
    );

    // Write generated output to YAML file (contains both raw and processed outputs)
    const generatedOutputPath = path.join(matchDir, `2-${typePrefix}-generated-output.yaml`);
    const outputData = {
      scenarioId: artifact.recommendationId,
      rawOutput: artifact.rawOutput, // Immutable guarantee - zero processing
      generatedOutput: artifact.generatedOutput, // May be processed in future
    };
    fs.writeFileSync(
      generatedOutputPath,
      yaml.dump(outputData, { lineWidth: -1, noRefs: true }),
      'utf-8'
    );

    // Write judge prompt to YAML file (only if provided)
    if (artifact.judgePrompt) {
      const judgePromptPath = path.join(matchDir, '3-judge-prompt.yaml');
      const promptData = {
        scenarioId: artifact.recommendationId,
        judgePrompt: artifact.judgePrompt,
      };
      fs.writeFileSync(
        judgePromptPath,
        yaml.dump(promptData, { lineWidth: -1, noRefs: true }),
        'utf-8'
      );
    }

    // Write judge evaluation to YAML file
    const judgeEvaluationPath = path.join(matchDir, '4-judge-evaluation.yaml');

    // Add scenarioId first, then overall quality summary if score breakdown available
    const judgeData: any = {
      scenarioId: artifact.recommendationId,
      ...artifact.judgeResponse,
    };

    if (artifact.scoreBreakdown) {
      judgeData.overallQuality = {};

      // Add category-specific scores
      if (artifact.scoreBreakdown.byCategory) {
        for (const [category, scores] of Object.entries(artifact.scoreBreakdown.byCategory)) {
          judgeData.overallQuality[category] = scores;
        }
      }

      // Add overall scores
      if (artifact.scoreBreakdown.overall) {
        judgeData.overallQuality.overall = artifact.scoreBreakdown.overall;
      }
    }

    fs.writeFileSync(
      judgeEvaluationPath,
      yaml.dump(judgeData, { lineWidth: -1, noRefs: true }),
      'utf-8'
    );

    // Write reporting summary markdown (keep as .md)
    const summaryPath = path.join(matchDir, '5-reporting-summary.md');
    const summaryContent = await this.formatArtifactSummary(artifact);
    fs.writeFileSync(summaryPath, summaryContent, 'utf-8');

    // Write LLM trace to YAML file with cost breakdown
    const llmTracePath = path.join(matchDir, '6-llm-trace.yaml');
    const costBreakdown = await this.calculateCostBreakdown(artifact);
    const llmStatsWithBreakdown = {
      scenarioId: artifact.recommendationId,
      ...artifact.llmStats,
      total: {
        ...artifact.llmStats.total,
        costBreakdown,
      },
    };
    fs.writeFileSync(
      llmTracePath,
      yaml.dump(llmStatsWithBreakdown, { lineWidth: -1, noRefs: true }),
      'utf-8'
    );

    Logger.info(`[ArtifactWriter] ✓ Artifact written: ${matchDir}`);
  }

  /**
   * Write artifacts for multi-model test with nested structure
   * Structure:
   *   {test-id}/
   *   ├── 1-shared-inputs.yaml
   *   ├── model-{alias}/
   *   │   ├── 2-generated-output.yaml (combined: modelInfo + output)
   *   │   ├── 3-judge-prompt.yaml
   *   │   ├── 4-judge-evaluation.yaml
   *   │   └── 5-llm-trace.yaml
   *   └── 6-comparison-summary.md (created after all models complete)
   */
  private async writeMultiModelArtifact(
    artifact: TestArtifact,
    modelAlias: string,
    modelConfig: ModelConfig
  ): Promise<void> {
    const matchDir = path.join(this.runDir, artifact.recommendationId);
    const modelDir = path.join(matchDir, `model-${modelAlias}`);

    // Create directories
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
    }

    // Write shared inputs (only once per test, not per model)
    const sharedInputsPath = path.join(matchDir, '1-shared-inputs.yaml');
    if (!fs.existsSync(sharedInputsPath)) {
      fs.writeFileSync(
        sharedInputsPath,
        yaml.dump(artifact.inputs, { lineWidth: -1, noRefs: true }),
        'utf-8'
      );
    }

    // Write combined generated output + model info
    const generatedOutputPath = path.join(modelDir, '2-generated-output.yaml');
    const outputData = {
      modelInfo: {
        modelId: modelConfig.modelId,
        temperature: modelConfig.temperature,
        topP: modelConfig.topP,
        maxTokens: modelConfig.maxTokens,
      },
      rawOutput: artifact.rawOutput, // Immutable guarantee - zero processing
      generatedOutput: artifact.generatedOutput, // May be processed in future
    };
    fs.writeFileSync(
      generatedOutputPath,
      yaml.dump(outputData, { lineWidth: -1, noRefs: true }),
      'utf-8'
    );

    // Write judge prompt to YAML file (only if provided)
    if (artifact.judgePrompt) {
      const judgePromptPath = path.join(modelDir, '3-judge-prompt.yaml');
      const promptData = { judgePrompt: artifact.judgePrompt };
      fs.writeFileSync(
        judgePromptPath,
        yaml.dump(promptData, { lineWidth: -1, noRefs: true }),
        'utf-8'
      );
    }

    // Write judge evaluation to YAML file
    const judgeEvaluationPath = path.join(modelDir, '4-judge-evaluation.yaml');

    // Add overall quality summary if score breakdown available
    const judgeData = { ...artifact.judgeResponse };
    if (artifact.scoreBreakdown) {
      judgeData.overallQuality = {};

      // Add category-specific scores
      if (artifact.scoreBreakdown.byCategory) {
        for (const [category, scores] of Object.entries(artifact.scoreBreakdown.byCategory)) {
          judgeData.overallQuality[category] = scores;
        }
      }

      // Add overall scores
      if (artifact.scoreBreakdown.overall) {
        judgeData.overallQuality.overall = artifact.scoreBreakdown.overall;
      }
    }

    fs.writeFileSync(
      judgeEvaluationPath,
      yaml.dump(judgeData, { lineWidth: -1, noRefs: true }),
      'utf-8'
    );

    // Write LLM trace to YAML file with cost breakdown
    const llmTracePath = path.join(modelDir, '5-llm-trace.yaml');
    const costBreakdown = await this.calculateCostBreakdown(artifact);
    const llmStatsWithBreakdown = {
      ...artifact.llmStats,
      total: {
        ...artifact.llmStats.total,
        costBreakdown,
      },
    };
    fs.writeFileSync(
      llmTracePath,
      yaml.dump(llmStatsWithBreakdown, { lineWidth: -1, noRefs: true }),
      'utf-8'
    );

    Logger.info(`[ArtifactWriter] ✓ Multi-model artifact written: ${modelDir}`);
  }

  /**
   * Write comparison summary for multi-model test (after all models complete)
   * This creates a markdown file comparing all model results for a test
   */
  async writeComparisonSummary(
    recommendationId: string,
    modelResults: Array<{
      modelAlias: string;
      modelConfig: ModelConfig;
      assessment: any;
      cost: number;
      latencyMs: number;
      llmStats?: any; // Add llmStats for cost breakdown
    }>
  ): Promise<void> {
    const matchDir = path.join(this.runDir, recommendationId);
    const summaryPath = path.join(matchDir, '6-comparison-summary.md');

    // Pre-calculate all cost breakdowns
    const taskCosts = await Promise.all(
      modelResults.map(async r => {
        if (r.llmStats) {
          const breakdown = await this.calculateCostBreakdown({ llmStats: r.llmStats } as any);
          return breakdown.taskCostUSD;
        }
        return r.cost;
      })
    );

    // Collect all quality attributes
    const allAttributes = new Set<string>();
    modelResults.forEach(r => {
      Object.keys(r.assessment || {}).forEach(attr => allAttributes.add(attr));
    });

    // Build markdown content
    const lines: string[] = [];
    lines.push(`# Multi-Model Comparison: ${recommendationId}`);
    lines.push('');
    lines.push('## Models Compared');
    lines.push('');
    modelResults.forEach((r, idx) => {
      const taskCost = taskCosts[idx];

      lines.push(`- **${r.modelAlias}**: \`${r.modelConfig.modelId}\``);
      if (r.modelConfig.temperature !== undefined) {
        lines.push(`  - Temperature: ${r.modelConfig.temperature}`);
      }
      if (r.modelConfig.topP !== undefined) {
        lines.push(`  - Top-P: ${r.modelConfig.topP}`);
      }
      if (r.modelConfig.maxTokens !== undefined) {
        lines.push(`  - Max Tokens: ${r.modelConfig.maxTokens}`);
      }
      lines.push(`  - Task Cost: $${taskCost.toFixed(6)}`);
      lines.push(`  - Latency: ${r.latencyMs}ms`);
    });
    lines.push('');

    // Quality comparison table
    lines.push('## Quality Comparison');
    lines.push('');
    lines.push('| Attribute | ' + modelResults.map(r => r.modelAlias).join(' | ') + ' |');
    lines.push('|-----------|' + modelResults.map(() => '------').join('|') + '|');

    Array.from(allAttributes).forEach(attr => {
      const scores = modelResults.map(r => {
        const score = r.assessment?.[attr]?.score;
        if (score === undefined) return 'N/A';
        const status = score >= 4 ? '✓' : score >= 3 ? '⚠' : '✗';
        return `${status} ${score}/5`;
      });
      lines.push(`| ${attr} | ${scores.join(' | ')} |`);
    });
    lines.push('');

    // Average scores
    lines.push('## Average Scores');
    lines.push('');
    modelResults.forEach(r => {
      const scores = Object.values(r.assessment || {})
        .map((v: any) => v.score)
        .filter(s => s !== undefined);
      const avgScore =
        scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : 'N/A';
      lines.push(`- **${r.modelAlias}**: ${avgScore}`);
    });
    lines.push('');

    // Cost efficiency
    lines.push('## Cost Efficiency');
    lines.push('');
    lines.push(
      '*Note: Comparison uses task LLM costs only for fair model comparison. Total costs (task + judge) are shown in individual model `5-llm-trace.yaml` files.*'
    );
    lines.push('');
    modelResults.forEach((r, idx) => {
      const taskCost = taskCosts[idx];

      const scores = Object.values(r.assessment || {})
        .map((v: any) => v.score)
        .filter(s => s !== undefined);
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      const costEfficiency = avgScore > 0 ? (avgScore / taskCost).toFixed(0) : '0';
      lines.push(
        `- **${r.modelAlias}**: ${costEfficiency} quality-points per dollar (task cost: $${taskCost.toFixed(4)})`
      );
    });
    lines.push('');

    // Detailed assessments
    lines.push('## Detailed Assessments');
    lines.push('');
    modelResults.forEach(r => {
      lines.push(`### ${r.modelAlias}`);
      lines.push('');
      Object.entries(r.assessment || {}).forEach(([attr, data]: [string, any]) => {
        const score = data.score;
        const status = score >= 4 ? '✓' : score >= 3 ? '⚠' : '✗';
        lines.push(`**${status} ${attr}**: ${score}/5`);
        lines.push(`- ${data.reason}`);
        lines.push('');
      });
    });

    lines.push('---');
    lines.push('');
    lines.push('*For full details, see individual model directories*');

    fs.writeFileSync(summaryPath, lines.join('\n'), 'utf-8');
    Logger.info(`[ArtifactWriter] ✓ Comparison summary written: ${summaryPath}`);
  }

  private detectLambdaErrors(artifact: TestArtifact): {
    hasErrors: boolean;
    errorCount: number;
    turns: number[];
  } {
    const errors = { hasErrors: false, errorCount: 0, turns: [] as number[] };

    // Check if conversationMetadata exists and has turns with lambdaError
    if (artifact.conversationMetadata?.turns) {
      for (const turn of artifact.conversationMetadata.turns) {
        if ((turn as any).lambdaError) {
          errors.hasErrors = true;
          errors.errorCount++;
          errors.turns.push((turn as any).turnNumber || 0);
        }
      }
    }

    return errors;
  }

  private async calculateCostBreakdown(artifact: TestArtifact): Promise<{
    taskCostUSD: number;
    judgeCostUSD: number;
    taskPercent: number;
    judgePercent: number;
  }> {
    const taskCost = await calculateCost(
      artifact.llmStats.taskLLM.modelId,
      artifact.llmStats.taskLLM.inputTokens,
      artifact.llmStats.taskLLM.outputTokens
    );

    const judgeCost = await calculateCost(
      artifact.llmStats.judgeLLM.modelId,
      artifact.llmStats.judgeLLM.inputTokens,
      artifact.llmStats.judgeLLM.outputTokens
    );

    const total = taskCost + judgeCost;

    return {
      taskCostUSD: parseFloat(taskCost.toFixed(6)),
      judgeCostUSD: parseFloat(judgeCost.toFixed(6)),
      taskPercent: Math.round((taskCost / total) * 100),
      judgePercent: Math.round((judgeCost / total) * 100),
    };
  }

  private async formatArtifactSummary(artifact: TestArtifact): Promise<string> {
    const typePrefix = this.getTypePrefix();
    const lambdaErrors = this.detectLambdaErrors(artifact);
    const costBreakdown = await this.calculateCostBreakdown(artifact);

    return `# Test Artifact Summary: Match ${artifact.recommendationId}

**Timestamp:** ${artifact.timestamp}

${
  lambdaErrors.hasErrors
    ? `
---

⚠️ **LAMBDA EXECUTION ERRORS DETECTED**

- **Error Count:** ${lambdaErrors.errorCount}
- **Affected Turns:** ${lambdaErrors.turns.join(', ')}
- **Status:** Tool calls validated, but backend execution failed
- **Impact:** Agent received mock responses; conversation quality assessment may be affected

---
`
    : '---'
}

## 📂 Artifact Files

This test artifact has been split into the following files for easier navigation:

- **\`1-input-sources-to-${typePrefix}.yaml\`** - All input sources for the ${typePrefix}
- **\`2-${typePrefix}-generated-output.yaml\`** - Raw output from the ${typePrefix}
- **\`3-judge-prompt.yaml\`** - Auto-generated prompt sent to judge LLM
- **\`4-judge-evaluation.yaml\`** - Full judge evaluation with scores and reasons
- **\`5-reporting-summary.md\`** - This file (human-readable summary)
- **\`6-llm-trace.yaml\`** - Token usage, latency, trace metrics, and cost

---
${
  artifact.scoreBreakdown
    ? `
## 📊 Overall Quality

${
  artifact.scoreBreakdown.byCategory
    ? Object.entries(artifact.scoreBreakdown.byCategory)
        .map(
          ([category, scores]: [string, any]) => `
### ${category.charAt(0).toUpperCase() + category.slice(1)} Quality
**Weighted Average:** ${scores.weightedAverage}/5.0
**Simple Average:** ${scores.average}/5.0
`
        )
        .join('\n')
    : ''
}
${
  artifact.scoreBreakdown.overall
    ? `
### Overall
**Weighted Average:** ${artifact.scoreBreakdown.overall.weightedAverage}/5.0
**Simple Average:** ${artifact.scoreBreakdown.overall.average}/5.0
`
    : ''
}
---
`
    : ''
}
## 💰 Cost Breakdown

**Total Cost:** $${artifact.llmStats.total.estimatedCostUSD.toFixed(4)}

- **Task LLM:** $${costBreakdown.taskCostUSD.toFixed(4)} (${costBreakdown.taskPercent}%)
- **Judge LLM:** $${costBreakdown.judgeCostUSD.toFixed(4)} (${costBreakdown.judgePercent}%)

---

## 📊 Quality Assessment Summary

${this.formatAssessmentSummary(artifact.assessment)}

---
${
  artifact.assessment && typeof artifact.assessment === 'object'
    ? `
## 📈 All Attributes

| Attribute | Score | Weight | Contribution | Status |
|-----------|-------|--------|--------------|--------|
${this.formatAttributeTable(artifact.assessment)}

**Status:** ✓ Score ≥4 | ⚠ Score 3 or lower | ⊘ Not applicable

---
`
    : ''
}
*View detailed files in this directory for complete test data.*
`;
  }

  private formatAttributeTable(assessment: any): string {
    // Sort by weight descending (highest business impact first)
    const entries = Object.entries(assessment) as Array<[string, any]>;
    const sorted = entries.sort((a, b) => {
      const weightA = a[1].weight ?? 0;
      const weightB = b[1].weight ?? 0;
      return weightB - weightA;
    });

    return sorted
      .map(([attr, data]) => {
        if (data.score === null || data.score === undefined) {
          return `| ${attr} | N/A | ${data.weight ? Math.round(data.weight * 100) + '%' : 'N/A'} | -- | ⊘ |`;
        }

        const score = `${data.score}/5`;
        const weight = data.weight !== undefined ? Math.round(data.weight * 100) + '%' : 'N/A';
        const contribution =
          data.weightedScore !== undefined ? data.weightedScore.toFixed(2) : 'N/A';
        const status = data.score >= 4 ? '✓' : data.score >= 3 ? '⚠' : '⚠';

        return `| ${attr} | ${score} | ${weight} | ${contribution} | ${status} |`;
      })
      .join('\n');
  }

  private formatArtifact(artifact: TestArtifact): string {
    return `# Test Artifact: Match ${artifact.recommendationId}

**Timestamp:** ${artifact.timestamp}

---

## 📥 Input Sources

### AppliedCV
\`\`\`
${artifact.inputs.appliedSpec || '(empty)'}
\`\`\`

### SeekProfile
\`\`\`
${artifact.inputs.catalogListing || '(empty)'}
\`\`\`

### DefaultCV
\`\`\`
${artifact.inputs.defaultSpec || '(empty)'}
\`\`\`

---

## 📋 Task Prompt

\`\`\`
${artifact.taskPrompt}
\`\`\`

---

## 🤖 Task LLM Raw Output

\`\`\`
${artifact.generatedOutput}
\`\`\`

---

## ⚖️ Judge LLM JSON Response

\`\`\`json
${JSON.stringify(artifact.judgeResponse, null, 2)}
\`\`\`

---

## 📊 Quality Assessment Summary

${this.formatAssessmentSummary(artifact.assessment)}

---

*Generated by Smart Hire Testing Tools*
`;
  }

  private formatAssessmentSummary(assessment: any): string {
    // Handle null/undefined assessment (error scenarios)
    if (!assessment || typeof assessment !== 'object') {
      return '**No assessment available** - Error occurred before evaluation could be performed.';
    }

    const lines: string[] = [];

    Object.entries(assessment).forEach(([capability, data]: [string, any]) => {
      const score = data.score;
      const grade = data.grade || '';
      const status = score >= 4 ? '✓' : score >= 3 ? '⚠' : '✗';
      lines.push(`- **${status} ${capability}**: ${score}/5 (${grade})`);
      lines.push(`  - ${data.reason}`);
    });

    return lines.join('\n');
  }

  /**
   * Write test summary with metadata and consolidated results
   * This combines test configuration metadata with all test results in a standardized format
   */
  writeTestSummary(metadata: BenchmarkMetadata, results: any[], runTimestamp: string): void {
    const filename = `test-summary.yaml`;
    const filepath = path.join(this.runDir, filename);

    const manifest = {
      metadata,
      results: {
        timestamp: runTimestamp,
        totalTests: results.length,
        testCases: results.map(r => ({
          recommendationId: r.recommendationId,
          conversationId: r.conversationId, // For agent-replay traceability
          jobId: r.jobId,
          assessment: r.assessment, // Full judge response with score + reason
          scores: Object.entries(r.assessment).reduce((acc: any, [cap, data]: [string, any]) => {
            acc[cap] = data.score;
            return acc;
          }, {}),
        })),
        aggregated: this.calculateAggregates(results),
      },
    };

    fs.writeFileSync(filepath, yaml.dump(manifest, { lineWidth: -1, noRefs: true }), 'utf-8');
    Logger.info(`[ArtifactWriter] ✓ Test summary written: ${filepath}`);
  }

  /**
   * @deprecated Use writeTestSummary() instead
   * Legacy method for text-generation test type only. All new code should use writeTestSummary().
   * This method will be removed in a future version.
   */
  async writeSummary(results: any[], runTimestamp: string): Promise<void> {
    const filename = `summary.json`;
    const filepath = path.join(this.runDir, filename);

    // Detect if this is a multi-model run by checking if any result has modelAlias
    const isMultiModel = results.some(r => r.modelAlias !== undefined);

    if (isMultiModel) {
      await this.writeMultiModelSummary(results, runTimestamp, filepath);
    } else {
      this.writeSingleModelSummary(results, runTimestamp, filepath);
    }
  }

  /**
   * Write summary for single-model runs (backward compatible)
   */
  private writeSingleModelSummary(results: any[], runTimestamp: string, filepath: string): void {
    // Calculate total cost
    const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);

    // Extract metadata from first test (all tests should use same models/prompt template)
    const firstTest = results[0] || {};

    const summary = {
      timestamp: runTimestamp,
      totalTests: results.length,
      taskModel: firstTest.taskModel || 'unknown',
      llmJudgeModel: firstTest.judgeModel || 'unknown',
      taskPrompt: firstTest.taskPrompt || '',
      totalCostOfTest: parseFloat(totalCost.toFixed(6)),
      results: results.map(r => ({
        recommendationId: r.recommendationId,
        jobId: r.jobId,
        cost: parseFloat((r.cost || 0).toFixed(6)),
        assessment: r.assessment, // Full judge response with score + reason
        scores: Object.entries(r.assessment).reduce((acc: any, [cap, data]: [string, any]) => {
          acc[cap] = data.score;
          return acc;
        }, {}),
      })),
      aggregated: this.calculateAggregates(results),
    };

    fs.writeFileSync(filepath, JSON.stringify(summary, null, 2), 'utf-8');
    Logger.info(`[ArtifactWriter] ✓ Summary written: ${filepath}`);
  }

  /**
   * Write summary for multi-model runs with comparison data
   * Groups results by testId and includes per-model breakdowns
   */
  private async writeMultiModelSummary(
    results: any[],
    runTimestamp: string,
    filepath: string
  ): Promise<void> {
    // Calculate total cost
    const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);

    // Extract metadata from first test
    const firstTest = results[0] || {};

    // Group results by recommendationId (without model suffix)
    const testGroups: Map<string, any[]> = new Map();
    results.forEach(r => {
      // Extract base recommendationId (remove model suffix if present)
      const baseMatchId = String(r.recommendationId).replace(
        /-(?:sonnet|nova|llama|mistral|gpt|model)-[^-]+$/,
        ''
      );
      if (!testGroups.has(baseMatchId)) {
        testGroups.set(baseMatchId, []);
      }
      testGroups.get(baseMatchId)!.push(r);
    });

    // Get all models used
    const models = [...new Set(results.map(r => r.taskModel))];

    // Pre-calculate all cost breakdowns
    const costBreakdowns = await Promise.all(results.map(r => this.calculateCostBreakdown(r)));
    const costBreakdownMap = new Map(results.map((r, idx) => [r, costBreakdowns[idx]]));

    const summary = {
      timestamp: runTimestamp,
      isMultiModel: true,
      models: models,
      totalTests: testGroups.size, // Number of unique test cases
      totalRuns: results.length, // Total model runs (tests × models)
      llmJudgeModel: firstTest.judgeModel || 'unknown',
      taskPrompt: firstTest.taskPrompt || '',
      totalCostOfTest: parseFloat(totalCost.toFixed(6)),
      results: Array.from(testGroups.entries()).map(([baseMatchId, modelResults]) => {
        const perModelResults = modelResults.map(r => {
          // Get pre-calculated cost breakdown
          const costBreakdown = costBreakdownMap.get(r)!;

          return {
            modelAlias: r.modelAlias,
            taskModel: r.taskModel,
            cost: parseFloat((r.cost || 0).toFixed(6)),
            taskCost: costBreakdown.taskCostUSD,
            judgeCost: costBreakdown.judgeCostUSD,
            taskLatencyMs: r.llmStats?.taskLLM?.latencyMs || 0,
            judgeLatencyMs: r.llmStats?.judgeLLM?.latencyMs || 0,
            assessment: r.assessment,
            scores: Object.entries(r.assessment).reduce((acc: any, [cap, data]: [string, any]) => {
              acc[cap] = data.score;
              return acc;
            }, {}),
          };
        });

        return {
          recommendationId: baseMatchId,
          jobId: modelResults[0].jobId,
          models: perModelResults,
        };
      }),
      aggregated: {
        overall: this.calculateAggregates(results),
        byModel: models.reduce((acc: any, model: string) => {
          const modelResults = results.filter(r => r.taskModel === model);
          acc[model] = this.calculateAggregates(modelResults);
          return acc;
        }, {}),
      },
    };

    fs.writeFileSync(filepath, JSON.stringify(summary, null, 2), 'utf-8');
    Logger.info(`[ArtifactWriter] ✓ Multi-model summary written: ${filepath}`);
  }

  private calculateAggregates(results: any[]): any {
    // Collect all unique capabilities across all results (some may be omitted in certain tests)
    const allCapabilities = new Set<string>();
    results.forEach(result => {
      Object.keys(result.assessment || {}).forEach(cap => allCapabilities.add(cap));
    });

    const aggregated: Record<
      string,
      { avgScore: number; evaluatedTests: number; omittedTests: number }
    > = {};

    allCapabilities.forEach(cap => {
      let total = 0;
      let evaluated = 0;
      let omitted = 0;

      results.forEach(result => {
        const assessment = result.assessment[cap];
        if (assessment && assessment.score !== undefined) {
          // Attribute was evaluated for this test
          total += assessment.score;
          evaluated++;
        } else {
          // Attribute was omitted (not applicable) for this test
          omitted++;
        }
      });

      aggregated[cap] = {
        avgScore: evaluated > 0 ? parseFloat((total / evaluated).toFixed(1)) : 0,
        evaluatedTests: evaluated,
        omittedTests: omitted,
      };
    });

    return aggregated;
  }
}
