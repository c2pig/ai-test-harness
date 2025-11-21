#!/usr/bin/env node
/**
 * Conversation Flow Analysis - Main Orchestrator
 * Generates all conversation visualization charts for AI agent assessment
 *
 * Usage:
 *   tsx scripts/conversation-flow-analysis.ts <tenant-name> [timestamp]
 *
 * Examples:
 *   tsx scripts/conversation-flow-analysis.ts product-outreach-simulation
 *   tsx scripts/conversation-flow-analysis.ts product-outreach-simulation 2025-11-13_12-50-03
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  findLatestTestRun,
  loadConversationScenarios,
  loadProjectConfig,
  aggregateMetrics,
  generateMetricsJson
} from './lib/conversation-data-loader';
import {
  generateAgentPerformanceChart,
  generateStageDistributionChart,
  generateKnownCostsChart,
  generateStageCostsChart,
  generatePerformanceBreakdownChart,
  generateAgentPerformanceChartSingle,
  generateStageDistributionChartSingle,
  generateKnownCostsChartSingle,
  generateStageCostsChartSingle,
  generatePerformanceBreakdownChartSingle
} from './lib/chart-generators';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('❌ Error: Missing tenant name argument');
    console.log('\nUsage:');
    console.log('  tsx scripts/conversation-flow-analysis.ts <tenant-name>');
    console.log('\nExamples:');
    console.log('  tsx scripts/conversation-flow-analysis.ts product-outreach-simulation');
    process.exit(1);
  }

  const tenantName = args[0];

  console.log('🎨 Conversation Flow Analysis');
  console.log('━'.repeat(50));
  console.log(`📁 Tenant: ${tenantName}`);

  // Find the latest test run directory
  const runDir = findLatestTestRun(tenantName);
  if (!runDir) {
    console.error('❌ Could not find any test run directories');
    process.exit(1);
  }
  console.log(`🔍 Found latest test run: ${path.basename(runDir)}`);

  // Load project configuration
  const config = loadProjectConfig(tenantName);
  console.log(`📋 Project: ${config.project.name}`);

  // Load all conversation scenarios
  console.log('\n📊 Loading conversation scenarios...');
  const scenarios = loadConversationScenarios(runDir);

  if (scenarios.length === 0) {
    console.error('❌ No scenarios found to analyze');
    process.exit(1);
  }

  console.log(`✅ Loaded ${scenarios.length} scenarios`);

  // Calculate aggregated metrics
  const aggregated = aggregateMetrics(scenarios);
  console.log('\n📈 Aggregated Metrics:');
  console.log(`   Total Scenarios: ${aggregated.totalScenarios}`);
  console.log(`   Avg Turns/Scenario: ${aggregated.avgTurnsPerScenario.toFixed(1)}`);
  console.log(`   Total Tool Calls: ${aggregated.totalToolCalls}`);
  console.log(`   Successful Calls: ${aggregated.successfulToolCalls}`);
  console.log(`   Failed Calls: ${aggregated.failedToolCalls}`);
  console.log(`   Total Errors: ${aggregated.totalErrors}`);
  console.log(`   Completion Rate: ${aggregated.completionRate.toFixed(1)}%`);
  console.log(`   Total Cost: $${aggregated.totalCost.toFixed(4)}`);

  // Generate evaluation charts
  console.log('\n🎨 Generating evaluation diagrams...');

  const chartOptions = {
    width: 1200,
    height: 600,
    showLegend: false
  };

  try {
    // Chart 1: Agent Performance vs Candidate Reference
    console.log('   📊 1/5 Generating agent performance chart...');
    await generateAgentPerformanceChart(
      scenarios,
      path.join(runDir, 'agg-chart-01-agent-vs-candidate.png'),
      {
        ...chartOptions,
        title: 'Agent Performance (Candidate Benchmark)'
      }
    );

    // Chart 2: Stage Distribution
    console.log('   📊 2/5 Generating stage distribution chart...');
    await generateStageDistributionChart(
      scenarios,
      path.join(runDir, 'agg-chart-02-stage-distribution.png'),
      {
        ...chartOptions,
        title: 'Conversation Stage Distribution'
      }
    );

    // Chart 3a: Known Costs
    console.log('   📊 3/5 Generating known costs chart...');
    await generateKnownCostsChart(
      scenarios,
      aggregated,
      path.join(runDir, 'agg-chart-03a-cost-known.png'),
      {
        ...chartOptions,
        title: 'Known Costs'
      }
    );

    // Chart 3b: Stage Costs (Approximated)
    console.log('   📊 4/5 Generating stage costs chart...');
    await generateStageCostsChart(
      scenarios,
      aggregated,
      path.join(runDir, 'agg-chart-03b-cost-by-stage.png'),
      {
        ...chartOptions,
        title: 'Cost by Stage',
        subtitle: '⚠ Approximation: Assumes equal cost per turn'
      }
    );

    // Chart 4: Performance Breakdown
    console.log('   📊 5/5 Generating performance breakdown chart...');
    await generatePerformanceBreakdownChart(
      scenarios,
      aggregated,
      path.join(runDir, 'agg-chart-04-performance-breakdown.png'),
      {
        ...chartOptions,
        title: 'Performance Breakdown'
      }
    );

    console.log('\n✅ All aggregated diagrams generated successfully!');

    // Generate per-scenario charts
    console.log('\n🎨 Generating per-scenario diagrams...');

    for (const scenario of scenarios) {
      const scenarioDir = path.join(runDir, scenario.scenarioId);

      console.log(`   📊 ${scenario.scenarioId}...`);

      await generateAgentPerformanceChartSingle(
        scenario,
        path.join(scenarioDir, `${scenario.scenarioId}-01-agent-vs-candidate.png`),
        {
          ...chartOptions,
          title: `Agent Performance - ${scenario.scenarioId}`
        }
      );

      await generateStageDistributionChartSingle(
        scenario,
        path.join(scenarioDir, `${scenario.scenarioId}-02-stage-distribution.png`),
        {
          ...chartOptions,
          title: `Stage Distribution - ${scenario.scenarioId}`
        }
      );

      await generateKnownCostsChartSingle(
        scenario,
        path.join(scenarioDir, `${scenario.scenarioId}-03a-cost-known.png`),
        {
          ...chartOptions,
          title: `Known Costs - ${scenario.scenarioId}`
        }
      );

      await generateStageCostsChartSingle(
        scenario,
        path.join(scenarioDir, `${scenario.scenarioId}-03b-cost-by-stage.png`),
        {
          ...chartOptions,
          title: `Cost by Stage - ${scenario.scenarioId}`,
          subtitle: '⚠ Approximation: Assumes equal cost per turn'
        }
      );

      await generatePerformanceBreakdownChartSingle(
        scenario,
        path.join(scenarioDir, `${scenario.scenarioId}-04-performance-breakdown.png`),
        {
          ...chartOptions,
          title: `Performance Breakdown - ${scenario.scenarioId}`
        }
      );
    }

    console.log(`\n✅ Generated ${scenarios.length} × 5 = ${scenarios.length * 5} per-scenario charts!`);

    // Generate metrics.json
    console.log('\n📄 Generating metrics.json...');
    const metricsData = generateMetricsJson(scenarios, aggregated);
    fs.writeFileSync(
      path.join(runDir, 'metrics.json'),
      JSON.stringify(metricsData, null, 2)
    );
    console.log('✅ metrics.json generated successfully!');

    console.log('\n' + '━'.repeat(50));
    console.log('📂 Output location:', runDir);
    console.log('\n📋 Generated files:');
    console.log('   Aggregated Charts:');
    console.log('   • agg-chart-01-agent-vs-candidate.png');
    console.log('   • agg-chart-02-stage-distribution.png');
    console.log('   • agg-chart-03a-cost-known.png');
    console.log('   • agg-chart-03b-cost-by-stage.png');
    console.log('   • agg-chart-04-performance-breakdown.png');
    console.log('   Metrics:');
    console.log('   • metrics.json');
    console.log('   Per-Scenario Charts:');
    console.log(`   • ${scenarios.length} scenarios × 5 charts = ${scenarios.length * 5} charts`);
    scenarios.forEach(s => {
      console.log(`     - ${s.scenarioId}/chart-*.png`);
    });

  } catch (error) {
    console.error('\n❌ Error generating charts:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Execute
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
