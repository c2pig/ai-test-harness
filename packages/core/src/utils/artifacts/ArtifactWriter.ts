/**
 * ArtifactWriter
 *
 * Writes test artifacts to the file system in a structured format.
 * Supports single-model and multi-model test outputs.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Logger } from '../logger';
import { calculateCost } from '../pricing';
import { TestArtifact, ModelConfig, BenchmarkMetadata } from './types';

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
      Logger.debug(`[ArtifactWriter] Created run directory: ${this.runDir}`);
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

    if (!fs.existsSync(matchDir)) {
      fs.mkdirSync(matchDir, { recursive: true });
    }

    // Write input sources
    const inputSourcesPath = path.join(matchDir, `1-input-sources-to-${typePrefix}.yaml`);
    const inputData = { scenarioId: artifact.recommendationId, ...artifact.inputs };
    fs.writeFileSync(inputSourcesPath, yaml.dump(inputData, { lineWidth: -1, noRefs: true }), 'utf-8');

    // Write generated output
    const generatedOutputPath = path.join(matchDir, `2-${typePrefix}-generated-output.yaml`);
    const outputData = {
      scenarioId: artifact.recommendationId,
      rawOutput: artifact.rawOutput,
      generatedOutput: artifact.generatedOutput,
    };
    fs.writeFileSync(generatedOutputPath, yaml.dump(outputData, { lineWidth: -1, noRefs: true }), 'utf-8');

    // Write judge prompt (only if provided)
    if (artifact.judgePrompt) {
      const judgePromptPath = path.join(matchDir, '3-judge-prompt.yaml');
      const promptData = { scenarioId: artifact.recommendationId, judgePrompt: artifact.judgePrompt };
      fs.writeFileSync(judgePromptPath, yaml.dump(promptData, { lineWidth: -1, noRefs: true }), 'utf-8');
    }

    // Write judge evaluation
    const judgeEvaluationPath = path.join(matchDir, '4-judge-evaluation.yaml');
    const judgeData: any = { scenarioId: artifact.recommendationId, ...artifact.judgeResponse };

    if (artifact.scoreBreakdown) {
      judgeData.overallQuality = {};
      if (artifact.scoreBreakdown.byCategory) {
        for (const [category, scores] of Object.entries(artifact.scoreBreakdown.byCategory)) {
          judgeData.overallQuality[category] = scores;
        }
      }
      if (artifact.scoreBreakdown.overall) {
        judgeData.overallQuality.overall = artifact.scoreBreakdown.overall;
      }
    }

    fs.writeFileSync(judgeEvaluationPath, yaml.dump(judgeData, { lineWidth: -1, noRefs: true }), 'utf-8');

    // Write reporting summary markdown
    const summaryPath = path.join(matchDir, '5-reporting-summary.md');
    const summaryContent = await this.formatArtifactSummary(artifact);
    fs.writeFileSync(summaryPath, summaryContent, 'utf-8');

    // Write LLM trace with cost breakdown
    const llmTracePath = path.join(matchDir, '6-llm-trace.yaml');
    const costBreakdown = await this.calculateCostBreakdown(artifact);
    const llmStatsWithBreakdown = {
      scenarioId: artifact.recommendationId,
      ...artifact.llmStats,
      total: { ...artifact.llmStats.total, costBreakdown },
    };
    fs.writeFileSync(llmTracePath, yaml.dump(llmStatsWithBreakdown, { lineWidth: -1, noRefs: true }), 'utf-8');

    Logger.info(`[ArtifactWriter] ✓ Artifact written: ${matchDir}`);
  }

  /**
   * Write artifacts for multi-model test with nested structure
   */
  private async writeMultiModelArtifact(
    artifact: TestArtifact,
    modelAlias: string,
    modelConfig: ModelConfig
  ): Promise<void> {
    const matchDir = path.join(this.runDir, artifact.recommendationId);
    const modelDir = path.join(matchDir, `model-${modelAlias}`);

    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
    }

    // Write shared inputs (only once per test)
    const sharedInputsPath = path.join(matchDir, '1-shared-inputs.yaml');
    if (!fs.existsSync(sharedInputsPath)) {
      fs.writeFileSync(sharedInputsPath, yaml.dump(artifact.inputs, { lineWidth: -1, noRefs: true }), 'utf-8');
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
      rawOutput: artifact.rawOutput,
      generatedOutput: artifact.generatedOutput,
    };
    fs.writeFileSync(generatedOutputPath, yaml.dump(outputData, { lineWidth: -1, noRefs: true }), 'utf-8');

    // Write judge prompt (only if provided)
    if (artifact.judgePrompt) {
      const judgePromptPath = path.join(modelDir, '3-judge-prompt.yaml');
      fs.writeFileSync(judgePromptPath, yaml.dump({ judgePrompt: artifact.judgePrompt }, { lineWidth: -1, noRefs: true }), 'utf-8');
    }

    // Write judge evaluation
    const judgeEvaluationPath = path.join(modelDir, '4-judge-evaluation.yaml');
    const judgeData = { ...artifact.judgeResponse };
    if (artifact.scoreBreakdown) {
      judgeData.overallQuality = {};
      if (artifact.scoreBreakdown.byCategory) {
        for (const [category, scores] of Object.entries(artifact.scoreBreakdown.byCategory)) {
          judgeData.overallQuality[category] = scores;
        }
      }
      if (artifact.scoreBreakdown.overall) {
        judgeData.overallQuality.overall = artifact.scoreBreakdown.overall;
      }
    }
    fs.writeFileSync(judgeEvaluationPath, yaml.dump(judgeData, { lineWidth: -1, noRefs: true }), 'utf-8');

    // Write LLM trace with cost breakdown
    const llmTracePath = path.join(modelDir, '5-llm-trace.yaml');
    const costBreakdown = await this.calculateCostBreakdown(artifact);
    const llmStatsWithBreakdown = { ...artifact.llmStats, total: { ...artifact.llmStats.total, costBreakdown } };
    fs.writeFileSync(llmTracePath, yaml.dump(llmStatsWithBreakdown, { lineWidth: -1, noRefs: true }), 'utf-8');

    Logger.info(`[ArtifactWriter] ✓ Multi-model artifact written: ${modelDir}`);
  }

  /**
   * Write comparison summary for multi-model test (after all models complete)
   */
  async writeComparisonSummary(
    recommendationId: string,
    modelResults: Array<{
      modelAlias: string;
      modelConfig: ModelConfig;
      assessment: any;
      cost: number;
      latencyMs: number;
      llmStats?: any;
    }>
  ): Promise<void> {
    const matchDir = path.join(this.runDir, recommendationId);
    const summaryPath = path.join(matchDir, '6-comparison-summary.md');

    const taskCosts = await Promise.all(
      modelResults.map(async r => {
        if (r.llmStats) {
          const breakdown = await this.calculateCostBreakdown({ llmStats: r.llmStats } as any);
          return breakdown.taskCostUSD;
        }
        return r.cost;
      })
    );

    const allAttributes = new Set<string>();
    modelResults.forEach(r => {
      Object.keys(r.assessment || {}).forEach(attr => allAttributes.add(attr));
    });

    const lines: string[] = [];
    lines.push(`# Multi-Model Comparison: ${recommendationId}`, '', '## Models Compared', '');
    
    modelResults.forEach((r, idx) => {
      lines.push(`- **${r.modelAlias}**: \`${r.modelConfig.modelId}\``);
      if (r.modelConfig.temperature !== undefined) lines.push(`  - Temperature: ${r.modelConfig.temperature}`);
      if (r.modelConfig.topP !== undefined) lines.push(`  - Top-P: ${r.modelConfig.topP}`);
      if (r.modelConfig.maxTokens !== undefined) lines.push(`  - Max Tokens: ${r.modelConfig.maxTokens}`);
      lines.push(`  - Task Cost: $${taskCosts[idx].toFixed(6)}`, `  - Latency: ${r.latencyMs}ms`);
    });
    lines.push('');

    // Quality comparison table
    lines.push('## Quality Comparison', '');
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
    lines.push('## Average Scores', '');
    modelResults.forEach(r => {
      const scores = Object.values(r.assessment || {}).map((v: any) => v.score).filter(s => s !== undefined);
      const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : 'N/A';
      lines.push(`- **${r.modelAlias}**: ${avgScore}`);
    });
    lines.push('');

    // Cost efficiency
    lines.push('## Cost Efficiency', '');
    lines.push('*Note: Comparison uses task LLM costs only for fair model comparison.*', '');
    modelResults.forEach((r, idx) => {
      const scores = Object.values(r.assessment || {}).map((v: any) => v.score).filter(s => s !== undefined);
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      const costEfficiency = avgScore > 0 ? (avgScore / taskCosts[idx]).toFixed(0) : '0';
      lines.push(`- **${r.modelAlias}**: ${costEfficiency} quality-points per dollar (task cost: $${taskCosts[idx].toFixed(4)})`);
    });
    lines.push('');

    // Detailed assessments
    lines.push('## Detailed Assessments', '');
    modelResults.forEach(r => {
      lines.push(`### ${r.modelAlias}`, '');
      Object.entries(r.assessment || {}).forEach(([attr, data]: [string, any]) => {
        const score = data.score;
        const status = score >= 4 ? '✓' : score >= 3 ? '⚠' : '✗';
        lines.push(`**${status} ${attr}**: ${score}/5`, `- ${data.reason}`, '');
      });
    });

    lines.push('---', '', '*For full details, see individual model directories*');

    fs.writeFileSync(summaryPath, lines.join('\n'), 'utf-8');
    Logger.info(`[ArtifactWriter] ✓ Comparison summary written: ${summaryPath}`);
  }

  private detectLambdaErrors(artifact: TestArtifact): { hasErrors: boolean; errorCount: number; turns: number[] } {
    const errors = { hasErrors: false, errorCount: 0, turns: [] as number[] };
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

${lambdaErrors.hasErrors ? `
---

⚠️ **LAMBDA EXECUTION ERRORS DETECTED**

- **Error Count:** ${lambdaErrors.errorCount}
- **Affected Turns:** ${lambdaErrors.turns.join(', ')}
- **Status:** Tool calls validated, but backend execution failed
- **Impact:** Agent received mock responses; conversation quality assessment may be affected

---
` : '---'}

## 📂 Artifact Files

- **\`1-input-sources-to-${typePrefix}.yaml\`** - All input sources for the ${typePrefix}
- **\`2-${typePrefix}-generated-output.yaml\`** - Raw output from the ${typePrefix}
- **\`3-judge-prompt.yaml\`** - Auto-generated prompt sent to judge LLM
- **\`4-judge-evaluation.yaml\`** - Full judge evaluation with scores and reasons
- **\`5-reporting-summary.md\`** - This file (human-readable summary)
- **\`6-llm-trace.yaml\`** - Token usage, latency, trace metrics, and cost

---
${artifact.scoreBreakdown ? `
## 📊 Overall Quality

${artifact.scoreBreakdown.byCategory ? Object.entries(artifact.scoreBreakdown.byCategory)
  .map(([category, scores]: [string, any]) => `
### ${category.charAt(0).toUpperCase() + category.slice(1)} Quality
**Weighted Average:** ${scores.weightedAverage}/5.0
**Simple Average:** ${scores.average}/5.0
`).join('\n') : ''}
${artifact.scoreBreakdown.overall ? `
### Overall
**Weighted Average:** ${artifact.scoreBreakdown.overall.weightedAverage}/5.0
**Simple Average:** ${artifact.scoreBreakdown.overall.average}/5.0
` : ''}
---
` : ''}
## 💰 Cost Breakdown

**Total Cost:** $${artifact.llmStats.total.estimatedCostUSD.toFixed(4)}

- **Task LLM:** $${costBreakdown.taskCostUSD.toFixed(4)} (${costBreakdown.taskPercent}%)
- **Judge LLM:** $${costBreakdown.judgeCostUSD.toFixed(4)} (${costBreakdown.judgePercent}%)

---

## 📊 Quality Assessment Summary

${this.formatAssessmentSummary(artifact.assessment)}

---
${artifact.assessment && typeof artifact.assessment === 'object' ? `
## 📈 All Attributes

| Attribute | Score | Weight | Contribution | Status |
|-----------|-------|--------|--------------|--------|
${this.formatAttributeTable(artifact.assessment)}

**Status:** ✓ Score ≥4 | ⚠ Score 3 or lower | ⊘ Not applicable

---
` : ''}
*View detailed files in this directory for complete test data.*
`;
  }

  private formatAttributeTable(assessment: any): string {
    const entries = Object.entries(assessment) as Array<[string, any]>;
    const sorted = entries.sort((a, b) => (b[1].weight ?? 0) - (a[1].weight ?? 0));

    return sorted.map(([attr, data]) => {
      if (data.score === null || data.score === undefined) {
        return `| ${attr} | N/A | ${data.weight ? Math.round(data.weight * 100) + '%' : 'N/A'} | -- | ⊘ |`;
      }
      const score = `${data.score}/5`;
      const weight = data.weight !== undefined ? Math.round(data.weight * 100) + '%' : 'N/A';
      const contribution = data.weightedScore !== undefined ? data.weightedScore.toFixed(2) : 'N/A';
      const status = data.score >= 4 ? '✓' : '⚠';
      return `| ${attr} | ${score} | ${weight} | ${contribution} | ${status} |`;
    }).join('\n');
  }

  private formatAssessmentSummary(assessment: any): string {
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
          conversationId: r.conversationId,
          jobId: r.jobId,
          assessment: r.assessment,
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
   */
  async writeSummary(results: any[], runTimestamp: string): Promise<void> {
    const filename = `summary.json`;
    const filepath = path.join(this.runDir, filename);
    const isMultiModel = results.some(r => r.modelAlias !== undefined);

    if (isMultiModel) {
      await this.writeMultiModelSummary(results, runTimestamp, filepath);
    } else {
      this.writeSingleModelSummary(results, runTimestamp, filepath);
    }
  }

  private writeSingleModelSummary(results: any[], runTimestamp: string, filepath: string): void {
    const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);
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
        assessment: r.assessment,
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

  private async writeMultiModelSummary(results: any[], runTimestamp: string, filepath: string): Promise<void> {
    const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);
    const firstTest = results[0] || {};

    const testGroups: Map<string, any[]> = new Map();
    results.forEach(r => {
      const baseMatchId = String(r.recommendationId).replace(/-(?:sonnet|nova|llama|mistral|gpt|model)-[^-]+$/, '');
      if (!testGroups.has(baseMatchId)) testGroups.set(baseMatchId, []);
      testGroups.get(baseMatchId)!.push(r);
    });

    const models = [...new Set(results.map(r => r.taskModel))];
    const costBreakdowns = await Promise.all(results.map(r => this.calculateCostBreakdown(r)));
    const costBreakdownMap = new Map(results.map((r, idx) => [r, costBreakdowns[idx]]));

    const summary = {
      timestamp: runTimestamp,
      isMultiModel: true,
      models,
      totalTests: testGroups.size,
      totalRuns: results.length,
      llmJudgeModel: firstTest.judgeModel || 'unknown',
      taskPrompt: firstTest.taskPrompt || '',
      totalCostOfTest: parseFloat(totalCost.toFixed(6)),
      results: Array.from(testGroups.entries()).map(([baseMatchId, modelResults]) => {
        const perModelResults = modelResults.map(r => {
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
        return { recommendationId: baseMatchId, jobId: modelResults[0].jobId, models: perModelResults };
      }),
      aggregated: {
        overall: this.calculateAggregates(results),
        byModel: models.reduce((acc: any, model: string) => {
          acc[model] = this.calculateAggregates(results.filter(r => r.taskModel === model));
          return acc;
        }, {}),
      },
    };

    fs.writeFileSync(filepath, JSON.stringify(summary, null, 2), 'utf-8');
    Logger.info(`[ArtifactWriter] ✓ Multi-model summary written: ${filepath}`);
  }

  private calculateAggregates(results: any[]): any {
    const allCapabilities = new Set<string>();
    results.forEach(result => {
      Object.keys(result.assessment || {}).forEach(cap => allCapabilities.add(cap));
    });

    const aggregated: Record<string, { avgScore: number; evaluatedTests: number; omittedTests: number }> = {};

    allCapabilities.forEach(cap => {
      let total = 0;
      let evaluated = 0;
      let omitted = 0;

      results.forEach(result => {
        const assessment = result.assessment[cap];
        if (assessment && assessment.score !== undefined) {
          total += assessment.score;
          evaluated++;
        } else {
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

