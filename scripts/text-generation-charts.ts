#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { ChartConfiguration } from 'chart.js';

// Chart dimensions
const CHART_WIDTH = 1000;
const CHART_HEIGHT = 600;

// Model colors - Support up to 5 models
const MODEL_COLORS = [
  'rgba(144, 238, 144, 0.8)',  // Light green (Sonnet)
  'rgba(65, 105, 225, 0.8)',   // Royal blue (Nova Pro)
  'rgba(255, 218, 185, 0.8)',  // Peach (Nova Lite)
  'rgba(255, 165, 0, 0.8)',    // Orange (Model 4)
  'rgba(147, 112, 219, 0.8)'   // Purple (Model 5)
];

// Quality attribute colors for single-model
const QUALITY_COLORS = [
  'rgba(75, 192, 192, 0.8)',
  'rgba(54, 162, 235, 0.8)',
  'rgba(255, 206, 86, 0.8)',
  'rgba(153, 102, 255, 0.8)',
  'rgba(255, 159, 64, 0.8)',
  'rgba(199, 199, 199, 0.8)',
  'rgba(83, 102, 255, 0.8)',
  'rgba(255, 99, 132, 0.8)'
];

interface SummaryData {
  isMultiModel?: boolean;
  totalTests?: number;
  models?: string[];
  taskModel?: string;
  llmJudgeModel?: string;
  aggregated: {
    byModel?: {
      [modelId: string]: {
        [attribute: string]: {
          avgScore: number;
          evaluatedTests: number;
          omittedTests: number;
        };
      };
    };
    [attribute: string]: any;
  };
  results: Array<{
    recommendationId?: string | number;
    cost?: number;
    models?: Array<{
      modelAlias: string;
      taskModel: string;
      taskCost: number;
      judgeCost: number;
      taskLatencyMs?: number;
      judgeLatencyMs?: number;
    }>;
  }>;
}

interface ProjectConfig {
  project: {
    name: string;
    description: string;
  };
}

/**
 * Find the latest timestamped folder in the given directory
 */
function findLatestFolder(baseDir: string): string | null {
  if (!fs.existsSync(baseDir)) {
    console.error(`Directory not found: ${baseDir}`);
    return null;
  }

  const folders = fs.readdirSync(baseDir)
    .filter(name => {
      const fullPath = path.join(baseDir, name);
      return fs.statSync(fullPath).isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(name);
    })
    .sort()
    .reverse(); // Latest first

  return folders.length > 0 ? path.join(baseDir, folders[0]) : null;
}

function extractModelAlias(modelId: string): string {
  // Claude Sonnet models
  if (modelId.includes('claude-3-5-sonnet')) {
    return 'Sonnet 3.5';
  }
  if (modelId.includes('claude-sonnet-4-5')) {
    return 'Sonnet 4.5';
  }
  if (modelId.includes('claude-sonnet-4')) {
    return 'Sonnet 4';
  }
  if (modelId.includes('sonnet')) {
    return 'Sonnet';
  }

  // AWS Nova models
  if (modelId.includes('nova-lite')) {
    return 'Nova Lite v1';
  }
  if (modelId.includes('nova-pro')) {
    return 'Nova Pro v1';
  }
  if (modelId.includes('nova-micro')) {
    return 'Nova Micro v1';
  }

  // Meta Llama models
  if (modelId.includes('llama4-maverick')) {
    return 'Llama 4 Maverick';
  }
  if (modelId.includes('llama4-scout')) {
    return 'Llama 4 Scout';
  }
  if (modelId.includes('llama3-1-405b')) {
    return 'Llama 3.1 405B';
  }
  if (modelId.includes('llama3-1-70b')) {
    return 'Llama 3.1 70B';
  }
  if (modelId.includes('llama3-1-8b')) {
    return 'Llama 3.1 8B';
  }
  if (modelId.includes('llama')) {
    return 'Llama';
  }

  // Qwen models
  if (modelId.includes('qwen3-235b')) {
    return 'Qwen 3 235B';
  }
  if (modelId.includes('qwen')) {
    return 'Qwen';
  }

  // DeepSeek models
  if (modelId.includes('deepseek-r1')) {
    return 'DeepSeek R1';
  }
  if (modelId.includes('deepseek.v3') || modelId.includes('deepseek-v3')) {
    return 'DeepSeek V3';
  }
  if (modelId.includes('deepseek')) {
    return 'DeepSeek';
  }

  // OpenAI GPT-OSS models
  if (modelId.includes('gpt-oss-120b')) {
    return 'GPT-OSS 120B';
  }
  if (modelId.includes('gpt-4')) {
    return 'GPT-4';
  }
  if (modelId.includes('gpt-3.5')) {
    return 'GPT-3.5';
  }
  if (modelId.includes('gpt')) {
    return 'GPT-OSS';
  }

  // Fallback: extract last part
  const parts = modelId.split(/[:./-]/);
  return parts[parts.length - 1] || modelId;
}

/**
 * Format attribute name for display
 */
function formatAttributeName(attr: string): string {
  // Remove "custom/quality/" prefix
  const parts = attr.split('/');
  const name = parts[parts.length - 1];

  // Add spaces before capitals
  return name.replace(/([A-Z])/g, ' $1').trim();
}

/**
 * Generate quality comparison chart (MULTI-MODEL)
 */
async function generateQualityComparisonChart(
  summary: SummaryData,
  outputPath: string,
  projectName: string,
  judgeModelAlias: string
): Promise<void> {
  const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    backgroundColour: 'white'
  });

  // Extract model information
  const models = summary.models!;
  const modelAliases = models.map(extractModelAlias);
  const testCount = summary.totalTests || summary.results.length;

  // Get all quality attributes from first model
  const firstModel = models[0];
  const attributes = Object.keys(summary.aggregated.byModel![firstModel] || {})
    .filter(attr => attr !== 'total') // Filter out metadata
    .sort((a, b) => formatAttributeName(a).localeCompare(formatAttributeName(b))); // Sort alphabetically by formatted name

  // Build datasets (one per model)
  const datasets = models.map((modelId, idx) => {
    const scores = attributes.map(attr => {
      const data = summary.aggregated.byModel![modelId]?.[attr];
      return data ? data.avgScore : 0;
    });

    return {
      label: modelAliases[idx],
      data: scores,
      backgroundColor: MODEL_COLORS[idx % MODEL_COLORS.length],
      borderColor: MODEL_COLORS[idx % MODEL_COLORS.length].replace('0.8', '1'),
      borderWidth: 1
    };
  });

  // Create Chart.js configuration
  const configuration: ChartConfiguration = {
    type: 'bar',
    data: {
      labels: attributes.map(formatAttributeName),
      datasets: datasets
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: `Multi-Model Quality Comparison (N=${testCount} tests per model)`,
          font: { size: 18 }
        },
        subtitle: {
          display: true,
          text: `${projectName} | Judge: ${judgeModelAlias}`,
          font: { size: 14 },
          padding: { bottom: 10 }
        },
        legend: {
          display: true,
          position: 'bottom'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 5,
          ticks: {
            stepSize: 1,
            font: { size: 12 },
            color: '#000'
          },
          title: {
            display: true,
            text: 'Average Score (0-5)',
            font: { size: 14 },
            color: '#000'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        },
        x: {
          ticks: {
            maxRotation: 90,
            minRotation: 90,
            font: { size: 12 },
            color: '#000'
          },
          title: {
            display: true,
            text: 'Quality Attributes',
            font: { size: 14 },
            color: '#000'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        }
      }
    },
    plugins: [{
      id: 'customDataLabels',
      afterDatasetsDraw: (chart) => {
        const ctx = chart.ctx;
        chart.data.datasets.forEach((dataset, i) => {
          const meta = chart.getDatasetMeta(i);
          meta.data.forEach((bar: any, index) => {
            const data = dataset.data[index] as number;
            if (data > 0) {
              ctx.save();
              ctx.fillStyle = '#000';
              ctx.font = 'bold 9px Arial';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              // Rotate text 90 degrees for better readability
              ctx.translate(bar.x, bar.y - 3);
              ctx.rotate(-Math.PI / 2);
              ctx.fillText(data.toFixed(1), 0, 3);
              ctx.restore();
            }
          });
        });
      }
    }]
  };

  // Render and save
  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  fs.writeFileSync(outputPath, buffer);
  console.log(`✓ Quality comparison chart saved: ${outputPath}`);
}

/**
 * Generate cost comparison chart (MULTI-MODEL)
 */
async function generateCostComparisonChart(
  summary: SummaryData,
  outputPath: string,
  projectName: string,
  judgeModelAlias: string
): Promise<void> {
  const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    backgroundColour: 'white'
  });

  const models = summary.models!;
  const modelAliases = models.map(extractModelAlias);
  const testCount = summary.totalTests || summary.results.length;

  const avgTaskCosts = models.map(modelId => {
    const testCosts: number[] = [];
    summary.results.forEach(result => {
      const modelData = result.models?.find(m => m.taskModel === modelId);
      if (modelData && modelData.taskCost !== undefined) {
        testCosts.push(modelData.taskCost);
      }
    });

    const avgCost = testCosts.length > 0
      ? testCosts.reduce((sum, cost) => sum + cost, 0) / testCosts.length
      : 0;

    console.log(`[Cost] ${extractModelAlias(modelId)}: ${testCosts.length} tests, avg = $${avgCost.toFixed(6)}`);
    return avgCost;
  });

  const configuration: ChartConfiguration = {
    type: 'bar',
    data: {
      labels: modelAliases,
      datasets: [{
        label: 'Average Task Cost per Test (USD)',
        data: avgTaskCosts,
        backgroundColor: MODEL_COLORS,
        borderColor: MODEL_COLORS.map(c => c.replace('0.8', '1')),
        borderWidth: 1
      }]
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: `Multi-Model Cost Comparison - Task LLM Only (N=${testCount} tests per model)`,
          font: { size: 18 }
        },
        subtitle: {
          display: true,
          text: `${projectName} | Judge: ${judgeModelAlias}`,
          font: { size: 14 },
          padding: { bottom: 10 }
        },
        legend: {
          display: true,
          position: 'bottom'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Cost (USD)',
            font: { size: 14 },
            color: '#000'
          },
          ticks: {
            callback: (value) => `$${Number(value).toFixed(6)}`,
            font: { size: 12 },
            color: '#000'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Models',
            font: { size: 14 },
            color: '#000'
          },
          ticks: {
            font: { size: 12 },
            color: '#000'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        }
      }
    },
    plugins: [{
      id: 'customDataLabels',
      afterDatasetsDraw: (chart) => {
        const ctx = chart.ctx;
        chart.data.datasets.forEach((dataset, i) => {
          const meta = chart.getDatasetMeta(i);
          meta.data.forEach((bar: any, index) => {
            const data = dataset.data[index] as number;
            if (data > 0) {
              ctx.fillStyle = '#000';
              ctx.font = 'bold 14px Arial';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              ctx.fillText(`$${data.toFixed(6)}`, bar.x, bar.y - 5);
            }
          });
        });
      }
    }]
  };

  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  fs.writeFileSync(outputPath, buffer);
  console.log(`✓ Cost comparison chart saved: ${outputPath}`);
}

/**
 * Generate latency comparison chart (MULTI-MODEL)
 */
async function generateLatencyComparisonChart(
  summary: SummaryData,
  outputPath: string,
  projectName: string,
  judgeModelAlias: string
): Promise<void> {
  const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    backgroundColour: 'white'
  });

  const models = summary.models!;
  const modelAliases = models.map(extractModelAlias);
  const testCount = summary.totalTests || summary.results.length;

  const avgLatencies = models.map(modelId => {
    const testLatencies: number[] = [];

    summary.results.forEach(result => {
      const modelData = result.models?.find(m => m.taskModel === modelId);
      if (modelData && modelData.taskLatencyMs !== undefined && modelData.taskLatencyMs > 0) {
        testLatencies.push(modelData.taskLatencyMs);
      }
    });

    const avgLatency = testLatencies.length > 0
      ? testLatencies.reduce((sum, lat) => sum + lat, 0) / testLatencies.length
      : 0;

    console.log(`[Latency] ${extractModelAlias(modelId)}: ${testLatencies.length} tests, avg = ${avgLatency.toFixed(0)}ms`);
    return avgLatency;
  });

  const configuration: ChartConfiguration = {
    type: 'bar',
    data: {
      labels: modelAliases,
      datasets: [{
        label: 'Average Task Latency per Test (ms)',
        data: avgLatencies,
        backgroundColor: MODEL_COLORS,
        borderColor: MODEL_COLORS.map(c => c.replace('0.8', '1')),
        borderWidth: 1
      }]
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: `Multi-Model Latency Comparison - Task LLM Only (N=${testCount} tests per model)`,
          font: { size: 18 }
        },
        subtitle: {
          display: true,
          text: `${projectName} | Judge: ${judgeModelAlias}`,
          font: { size: 14 },
          padding: { bottom: 10 }
        },
        legend: {
          display: true,
          position: 'bottom'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Latency (milliseconds)',
            font: { size: 14 },
            color: '#000'
          },
          ticks: {
            callback: (value) => `${Number(value).toFixed(0)}ms`,
            font: { size: 12 },
            color: '#000'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Models',
            font: { size: 14 },
            color: '#000'
          },
          ticks: {
            font: { size: 12 },
            color: '#000'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        }
      }
    },
    plugins: [{
      id: 'customDataLabels',
      afterDatasetsDraw: (chart) => {
        const ctx = chart.ctx;
        chart.data.datasets.forEach((dataset, i) => {
          const meta = chart.getDatasetMeta(i);
          meta.data.forEach((bar: any, index) => {
            const data = dataset.data[index] as number;
            if (data > 0) {
              ctx.fillStyle = '#000';
              ctx.font = 'bold 14px Arial';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              ctx.fillText(`${data.toFixed(0)}ms`, bar.x, bar.y - 5);
            }
          });
        });
      }
    }]
  };

  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  fs.writeFileSync(outputPath, buffer);
  console.log(`✓ Latency comparison chart saved: ${outputPath}`);
}

/**
 * Generate single-model quality chart
 */
async function generateSingleModelQualityChart(
  summary: SummaryData,
  outputPath: string,
  projectName: string,
  judgeModelAlias: string
): Promise<void> {
  const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    backgroundColour: 'white'
  });

  const testCount = summary.totalTests || summary.results.length;

  // Extract quality attributes from aggregated data (flat structure)
  const attributes = Object.keys(summary.aggregated)
    .filter(attr => {
      const value = summary.aggregated[attr];
      return value && typeof value === 'object' && 'avgScore' in value;
    })
    .sort((a, b) => formatAttributeName(a).localeCompare(formatAttributeName(b))); // Sort alphabetically by formatted name

  const scores = attributes.map(attr => summary.aggregated[attr].avgScore);

  const configuration: ChartConfiguration = {
    type: 'bar',
    data: {
      labels: attributes.map(formatAttributeName),
      datasets: [{
        label: 'Quality Score',
        data: scores,
        backgroundColor: QUALITY_COLORS,
        borderColor: QUALITY_COLORS.map(c => c.replace('0.8', '1')),
        borderWidth: 1
      }]
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: `Quality Attribute Scores (N=${testCount} tests)`,
          font: { size: 18 }
        },
        subtitle: {
          display: true,
          text: `${projectName} | Judge: ${judgeModelAlias}`,
          font: { size: 14 },
          padding: { bottom: 10 }
        },
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 5,
          ticks: {
            stepSize: 1,
            font: { size: 12 },
            color: '#000'
          },
          title: {
            display: true,
            text: 'Average Score (0-5)',
            font: { size: 14 },
            color: '#000'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        },
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 45,
            font: { size: 12 },
            color: '#000'
          },
          title: {
            display: true,
            text: 'Quality Attributes',
            font: { size: 14 },
            color: '#000'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        }
      }
    },
    plugins: [{
      id: 'customDataLabels',
      afterDatasetsDraw: (chart) => {
        const ctx = chart.ctx;
        chart.data.datasets.forEach((dataset, i) => {
          const meta = chart.getDatasetMeta(i);
          meta.data.forEach((bar: any, index) => {
            const data = dataset.data[index] as number;
            if (data > 0) {
              ctx.fillStyle = '#000';
              ctx.font = 'bold 14px Arial';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              ctx.fillText(data.toFixed(1), bar.x, bar.y - 5);
            }
          });
        });
      }
    }]
  };

  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  fs.writeFileSync(outputPath, buffer);
  console.log(`✓ Single-model quality chart saved: ${outputPath}`);
}

/**
 * Generate single-model performance metrics chart
 */
async function generateSingleModelMetricsChart(
  summary: SummaryData,
  latestFolder: string,
  outputPath: string,
  projectName: string,
  judgeModelAlias: string
): Promise<void> {
  const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    backgroundColour: 'white'
  });

  const testCount = summary.totalTests || summary.results.length;

  // Aggregate cost and latency from 6-llm-trace.yaml files
  let totalCost = 0;
  let totalLatency = 0;
  let count = 0;

  // Read all scenario folders
  const scenarioFolders = fs.readdirSync(latestFolder)
    .filter(name => {
      const fullPath = path.join(latestFolder, name);
      return fs.statSync(fullPath).isDirectory();
    });

  for (const folder of scenarioFolders) {
    const traceFile = path.join(latestFolder, folder, '6-llm-trace.yaml');
    if (fs.existsSync(traceFile)) {
      try {
        const traceContent = fs.readFileSync(traceFile, 'utf-8');
        const trace: any = yaml.load(traceContent);
        if (trace.total) {
          totalCost += trace.total.estimatedCostUSD || 0;
          totalLatency += trace.total.totalLatencyMs || 0;
          count++;
        }
      } catch (error) {
        console.warn(`Failed to read trace file: ${traceFile}`);
      }
    }
  }

  const avgCost = count > 0 ? totalCost / count : 0;
  const avgLatency = count > 0 ? totalLatency / count : 0;

  console.log(`[Metrics] Aggregated from ${count} trace files: avg cost = $${avgCost.toFixed(6)}, avg latency = ${avgLatency.toFixed(0)}ms`);

  const configuration: ChartConfiguration = {
    type: 'bar',
    data: {
      labels: ['Average Cost (USD)', 'Average Latency (seconds)'],
      datasets: [{
        label: 'Performance Metrics',
        data: [avgCost, avgLatency / 1000], // Convert latency to seconds
        backgroundColor: [
          'rgba(54, 162, 235, 0.8)',
          'rgba(255, 206, 86, 0.8)'
        ],
        borderColor: [
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)'
        ],
        borderWidth: 1
      }]
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: `Performance Metrics (N=${testCount} tests)`,
          font: { size: 18 }
        },
        subtitle: {
          display: true,
          text: `${projectName} | Judge: ${judgeModelAlias}`,
          font: { size: 14 },
          padding: { bottom: 10 }
        },
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Value',
            font: { size: 14 },
            color: '#000'
          },
          ticks: {
            font: { size: 12 },
            color: '#000'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        },
        x: {
          ticks: {
            font: { size: 12 },
            color: '#000'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        }
      }
    },
    plugins: [{
      id: 'customDataLabels',
      afterDatasetsDraw: (chart) => {
        const ctx = chart.ctx;
        chart.data.datasets.forEach((dataset, i) => {
          const meta = chart.getDatasetMeta(i);
          meta.data.forEach((bar: any, index) => {
            const data = dataset.data[index] as number;
            const label = index === 0 ? `$${data.toFixed(6)}` : `${data.toFixed(2)}s`;
            ctx.fillStyle = '#000';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(label, bar.x, bar.y - 5);
          });
        });
      }
    }]
  };

  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  fs.writeFileSync(outputPath, buffer);
  console.log(`✓ Single-model metrics chart saved: ${outputPath}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: npx tsx scripts/text-generation-charts.ts <tenant-name>');
    console.error('Example: npx tsx scripts/text-generation-charts.ts product-listing');
    process.exit(1);
  }

  const tenantName = args[0];
  console.log(`🎨 Generating text charts for tenant: ${tenantName}`);

  // Find latest test run folder
  // Try tenant name as-is first, then with examples/ prefix
  let baseDir = path.join(__dirname, '..', 'outputs', tenantName);
  if (!fs.existsSync(baseDir)) {
    baseDir = path.join(__dirname, '..', 'outputs', 'examples', tenantName);
  }
  const latestFolder = findLatestFolder(baseDir);

  if (!latestFolder) {
    console.error(`❌ No test run folders found in: ${baseDir}`);
    process.exit(1);
  }

  console.log(`📂 Found latest test run: ${path.basename(latestFolder)}`);

  // Read summary.json
  const summaryPath = path.join(latestFolder, 'summary.json');
  if (!fs.existsSync(summaryPath)) {
    console.error(`❌ summary.json not found: ${summaryPath}`);
    process.exit(1);
  }

  const summary: SummaryData = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));

  // Read config.yaml to get project name
  // Try tenant name as-is first, then with examples/ prefix
  let configPath = path.join(__dirname, '..', 'tenants', tenantName, 'config.yaml');
  if (!fs.existsSync(configPath)) {
    configPath = path.join(__dirname, '..', 'tenants', 'examples', tenantName, 'config.yaml');
  }
  if (!fs.existsSync(configPath)) {
    console.error(`❌ config.yaml not found: ${configPath}`);
    process.exit(1);
  }

  const configContent = fs.readFileSync(configPath, 'utf-8');
  const config = yaml.load(configContent) as ProjectConfig;
  const projectName = config.project.name;
  console.log(`📋 Project name: ${projectName}`);

  // Extract judge model alias
  const judgeModelId = summary.llmJudgeModel || 'Unknown';
  const judgeModelAlias = extractModelAlias(judgeModelId);
  console.log(`⚖️  Judge model: ${judgeModelAlias}`);

  // Determine mode: multi-model or single-model
  const isMultiModel = summary.isMultiModel === true;

  if (isMultiModel) {
    console.log(`\n🔀 Multi text test detected (${summary.models!.length} models, ${summary.results.length} test cases)`);
    console.log('📊 Generating 3 comparison charts...\n');

    const qualityChartPath = path.join(latestFolder, 'quality-comparison.png');
    const costChartPath = path.join(latestFolder, 'cost-comparison.png');
    const latencyChartPath = path.join(latestFolder, 'latency-comparison.png');

    await generateQualityComparisonChart(summary, qualityChartPath, projectName, judgeModelAlias);
    await generateCostComparisonChart(summary, costChartPath, projectName, judgeModelAlias);
    await generateLatencyComparisonChart(summary, latencyChartPath, projectName, judgeModelAlias);

    console.log('\n✅ Multi-model chart generation complete!');
    console.log(`📂 Output location: ${latestFolder}`);
    console.log('📋 Generated files:');
    console.log('   • quality-comparison.png');
    console.log('   • cost-comparison.png');
    console.log('   • latency-comparison.png');
  } else {
    console.log(`\n📝 Single text test detected (${summary.results.length} test cases)`);
    console.log('📊 Generating 2 summary charts...\n');

    const qualityChartPath = path.join(latestFolder, 'quality-scores.png');
    const metricsChartPath = path.join(latestFolder, 'performance-metrics.png');

    await generateSingleModelQualityChart(summary, qualityChartPath, projectName, judgeModelAlias);
    await generateSingleModelMetricsChart(summary, latestFolder, metricsChartPath, projectName, judgeModelAlias);

    console.log('\n✅ Single-model chart generation complete!');
    console.log(`📂 Output location: ${latestFolder}`);
    console.log('📋 Generated files:');
    console.log('   • quality-scores.png');
    console.log('   • performance-metrics.png');
  }
}

// Run main
main().catch(error => {
  console.error('❌ Error generating charts:', error);
  process.exit(1);
});
