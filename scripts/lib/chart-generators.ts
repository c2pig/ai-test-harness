/**
 * Chart Generators for Conversation Evaluation
 * Generates stakeholder-focused evaluation diagrams
 */

import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { ChartConfiguration } from 'chart.js';
import * as fs from 'fs';
import {
  ConversationScenario,
  AggregatedMetrics,
  ChartOptions
} from './types';
import {
  analyzeConversationStages,
  getCandidateReferenceScore,
  getUniqueQualityAttributes
} from './conversation-data-loader';

// Chart dimensions
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 600;

// Color palette
const COLORS = {
  primary: 'rgba(75, 192, 192, 0.8)',
  success: 'rgba(75, 192, 75, 0.8)',
  warning: 'rgba(255, 206, 86, 0.8)',
  error: 'rgba(255, 99, 132, 0.8)',
  info: 'rgba(54, 162, 235, 0.8)',
  purple: 'rgba(153, 102, 255, 0.8)',
  gray: 'rgba(201, 203, 207, 0.8)'
};

/**
 * Diagram 1: Agent Performance vs Candidate Reference
 * Shows agent quality scores with candidate benchmark line
 */
export async function generateAgentPerformanceChart(
  scenarios: ConversationScenario[],
  outputPath: string,
  options: ChartOptions
): Promise<void> {
  const width = options.width || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;

  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });

  // Get unique quality attributes, excluding candidate-related attributes
  const allAttributes = getUniqueQualityAttributes(scenarios);
  const attributes = allAttributes.filter(attr =>
    !attr.toLowerCase().includes('candidate')
  );

  // Calculate average score per attribute across all scenarios
  const attributeScores: Record<string, number[]> = {};

  for (const scenario of scenarios) {
    for (const attr of attributes) {
      if (scenario.qualityScores[attr]) {
        if (!attributeScores[attr]) {
          attributeScores[attr] = [];
        }
        attributeScores[attr].push(scenario.qualityScores[attr].score);
      }
    }
  }

  const avgScores = attributes.map(attr => {
    const scores = attributeScores[attr] || [];
    return scores.length > 0
      ? scores.reduce((sum, s) => sum + s, 0) / scores.length
      : 0;
  });

  // Get recruiter and candidate reference scores
  const recruiterRef = scenarios.length > 0 && scenarios[0].overallQuality?.recruiter?.weightedAverage !== undefined
    ? scenarios[0].overallQuality.recruiter.weightedAverage
    : null;
  const candidateRef = getCandidateReferenceScore(scenarios);

  // Color bars based on score thresholds
  const barColors = avgScores.map(score => {
    if (score < 3) return COLORS.error;
    if (score < 4) return COLORS.warning;
    return COLORS.success;
  });

  const configuration: ChartConfiguration = {
    type: 'bar',
    data: {
      labels: attributes.map(attr => attr.replace(/([A-Z])/g, ' $1').trim()),
      datasets: [
        {
          label: 'Quality Score',
          data: avgScores,
          backgroundColor: barColors,
          borderColor: barColors.map(c => c.replace('0.8', '1')),
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: options.title || 'Agent Performance (Recruiter vs Candidate Benchmark)',
          font: { size: 18, weight: 'bold' }
        },
        subtitle: options.subtitle ? {
          display: true,
          text: options.subtitle,
          font: { size: 14 }
        } : undefined,
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
            text: 'Score (0-5)',
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
          grid: {
            display: false
          }
        }
      }
    },
    plugins: [
      {
        id: 'referenceLines',
        beforeDraw: (chart: any) => {
          const ctx = chart.ctx;
          const yAxis = chart.scales.y;
          const xAxis = chart.scales.x;

          // Recruiter reference line (orange dotted)
          if (recruiterRef !== null && recruiterRef !== undefined) {
            const yPos = yAxis.getPixelForValue(recruiterRef);
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 159, 64, 0.8)'; // Orange
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(xAxis.left, yPos);
            ctx.lineTo(xAxis.right, yPos);
            ctx.stroke();
            ctx.restore();

            // Label
            ctx.fillStyle = 'rgba(255, 159, 64, 1)';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(`Recruiter: ${recruiterRef.toFixed(1)}`, xAxis.right - 150, yPos + 15);
          }

          // Candidate reference line (blue dotted)
          if (candidateRef !== null && candidateRef !== undefined) {
            const yPos = yAxis.getPixelForValue(candidateRef);
            ctx.save();
            ctx.strokeStyle = 'rgba(54, 162, 235, 0.8)'; // Blue
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(xAxis.left, yPos);
            ctx.lineTo(xAxis.right, yPos);
            ctx.stroke();
            ctx.restore();

            // Label
            ctx.fillStyle = 'rgba(54, 162, 235, 1)';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(`Candidate: ${candidateRef.toFixed(1)}`, xAxis.right - 150, yPos - 5);
          }

          // Target line at 4.0
          const target = yAxis.getPixelForValue(4.0);
          ctx.save();
          ctx.strokeStyle = 'rgba(75, 192, 75, 0.5)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(xAxis.left, target);
          ctx.lineTo(xAxis.right, target);
          ctx.stroke();
          ctx.restore();

          // Baseline line at 3.0
          const baseline = yAxis.getPixelForValue(3.0);
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 206, 86, 0.5)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(xAxis.left, baseline);
          ctx.lineTo(xAxis.right, baseline);
          ctx.stroke();
          ctx.restore();
        }
      },
      {
        id: 'dataLabels',
        afterDatasetsDraw: (chart: any) => {
          const ctx = chart.ctx;
          chart.data.datasets.forEach((dataset: any, i: number) => {
            const meta = chart.getDatasetMeta(i);
            meta.data.forEach((bar: any, index: number) => {
              const data = dataset.data[index] as number;
              if (data !== null && data !== undefined) {
                ctx.fillStyle = '#000';
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText(data.toFixed(1), bar.x, bar.y - 5);
              }
            });
          });
        }
      }
    ]
  };

  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  fs.writeFileSync(outputPath, buffer);
}

/**
 * Diagram 2: Conversation Stage Distribution
 * Shows percentage of turns spent in each stage
 */
export async function generateStageDistributionChart(
  scenarios: ConversationScenario[],
  outputPath: string,
  options: ChartOptions
): Promise<void> {
  const width = options.width || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;

  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });

  // Analyze stages
  const distribution = analyzeConversationStages(scenarios);
  const total = Object.values(distribution).reduce((sum, val) => sum + val, 0);

  const stages = ['Initial', 'Screening', 'Requirements', 'Consent', 'Rejected'];
  const counts = stages.map(stage => distribution[stage as keyof typeof distribution]);
  const percentages = counts.map(count => total > 0 ? (count / total) * 100 : 0);

  // Color coding: green (done), yellow (requirements), red (rejected), gray (not reached)
  const colors = percentages.map((pct, idx) => {
    const stage = stages[idx];
    if (stage === 'Initial' || stage === 'Screening') return COLORS.success;
    if (stage === 'Requirements') return COLORS.warning;
    if (stage === 'Rejected') return COLORS.error;
    return COLORS.gray;
  });

  const configuration: ChartConfiguration = {
    type: 'bar',
    data: {
      labels: stages,
      datasets: [{
        label: '% of Turns',
        data: percentages,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.8', '1')),
        borderWidth: 2
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: options.title || 'Conversation Stage Distribution',
          font: { size: 18, weight: 'bold' }
        },
        subtitle: options.subtitle ? {
          display: true,
          text: options.subtitle,
          font: { size: 14 }
        } : undefined,
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: (value) => `${value}%`,
            font: { size: 12 },
            color: '#000'
          },
          title: {
            display: true,
            text: 'Percentage of Total Turns',
            font: { size: 14 },
            color: '#000'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        },
        y: {
          ticks: {
            font: { size: 12 },
            color: '#000'
          },
          grid: {
            display: false
          }
        }
      }
    },
    plugins: [{
      id: 'dataLabels',
      afterDatasetsDraw: (chart: any) => {
        const ctx = chart.ctx;
        chart.data.datasets.forEach((dataset: any, i: number) => {
          const meta = chart.getDatasetMeta(i);
          meta.data.forEach((bar: any, index: number) => {
            const pct = dataset.data[index] as number;
            const count = counts[index];
            const label = `${pct.toFixed(1)}% (${count} turns)`;
            ctx.fillStyle = '#000';
            ctx.font = 'bold 13px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, bar.x + 5, bar.y);
          });
        });
      }
    }]
  };

  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  fs.writeFileSync(outputPath, buffer);
}

/**
 * Diagram 3a: Known Costs
 * Shows cost per conversation, per turn, and per success
 */
export async function generateKnownCostsChart(
  scenarios: ConversationScenario[],
  aggregated: AggregatedMetrics,
  outputPath: string,
  options: ChartOptions
): Promise<void> {
  const width = options.width || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;

  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });

  const totalTurns = scenarios.reduce((sum, s) => sum + s.turns.length, 0);
  const completedScenarios = scenarios.filter(s => s.metrics.completionRate === 100).length;

  const costPerConv = aggregated.totalCost / aggregated.totalScenarios;
  const costPerTurn = totalTurns > 0 ? aggregated.totalCost / totalTurns : 0;
  const costPerSuccess = completedScenarios > 0
    ? aggregated.totalCost / completedScenarios
    : 0;

  const labels = ['Per Conversation', 'Per Turn', 'Per Success'];
  const data = [costPerConv, costPerTurn, costPerSuccess];
  const displayLabels = data.map((cost, idx) =>
    idx === 2 && completedScenarios === 0 ? 'N/A' : `$${cost.toFixed(4)}`
  );

  const configuration: ChartConfiguration = {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Cost (USD)',
        data: data.map((cost, idx) => idx === 2 && completedScenarios === 0 ? 0 : cost),
        backgroundColor: [COLORS.info, COLORS.success, COLORS.warning],
        borderColor: [COLORS.info, COLORS.success, COLORS.warning].map(c => c.replace('0.8', '1')),
        borderWidth: 2
      }]
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: options.title || 'Known Costs',
          font: { size: 18, weight: 'bold' }
        },
        subtitle: options.subtitle ? {
          display: true,
          text: options.subtitle,
          font: { size: 14 }
        } : undefined,
        legend: {
          display: false
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
            callback: (value) => `$${Number(value).toFixed(4)}`,
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
            display: false
          }
        }
      }
    },
    plugins: [{
      id: 'dataLabels',
      afterDatasetsDraw: (chart: any) => {
        const ctx = chart.ctx;
        chart.data.datasets.forEach((dataset: any, i: number) => {
          const meta = chart.getDatasetMeta(i);
          meta.data.forEach((bar: any, index: number) => {
            const label = displayLabels[index];
            ctx.fillStyle = '#000';
            ctx.font = 'bold 14px Arial';
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
}

/**
 * Diagram 3b: Stage Costs (Approximated)
 * Shows estimated cost per stage
 */
export async function generateStageCostsChart(
  scenarios: ConversationScenario[],
  aggregated: AggregatedMetrics,
  outputPath: string,
  options: ChartOptions
): Promise<void> {
  const width = options.width || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;

  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });

  // Analyze stages
  const distribution = analyzeConversationStages(scenarios);
  const totalTurns = Object.values(distribution).reduce((sum, val) => sum + val, 0);

  const stages = ['Initial', 'Screening', 'Requirements', 'Consent', 'Rejected'];
  const stageCosts = stages.map(stage => {
    const turns = distribution[stage as keyof typeof distribution];
    return totalTurns > 0 ? (turns / totalTurns) * aggregated.totalCost : 0;
  });

  const configuration: ChartConfiguration = {
    type: 'bar',
    data: {
      labels: stages,
      datasets: [{
        label: 'Estimated Cost (USD)',
        data: stageCosts,
        backgroundColor: [
          COLORS.success,
          COLORS.success,
          COLORS.warning,
          COLORS.gray,
          COLORS.error
        ],
        borderColor: [
          COLORS.success,
          COLORS.success,
          COLORS.warning,
          COLORS.gray,
          COLORS.error
        ].map(c => c.replace('0.8', '1')),
        borderWidth: 2
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: options.title || 'Cost by Stage (Approximated)',
          font: { size: 18, weight: 'bold' }
        },
        subtitle: {
          display: true,
          text: options.subtitle || '⚠ Approximation: Assumes equal cost per turn',
          font: { size: 12 },
          color: '#ff6b6b'
        },
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Cost (USD)',
            font: { size: 14 },
            color: '#000'
          },
          ticks: {
            callback: (value) => `$${Number(value).toFixed(4)}`,
            font: { size: 12 },
            color: '#000'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        },
        y: {
          ticks: {
            font: { size: 12 },
            color: '#000'
          },
          grid: {
            display: false
          }
        }
      }
    },
    plugins: [{
      id: 'dataLabels',
      afterDatasetsDraw: (chart: any) => {
        const ctx = chart.ctx;
        chart.data.datasets.forEach((dataset: any, i: number) => {
          const meta = chart.getDatasetMeta(i);
          meta.data.forEach((bar: any, index: number) => {
            const cost = dataset.data[index] as number;
            const label = `$${cost.toFixed(4)}`;
            ctx.fillStyle = '#000';
            ctx.font = 'bold 13px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, bar.x + 5, bar.y);
          });
        });
      }
    }]
  };

  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  fs.writeFileSync(outputPath, buffer);
}

/**
 * Diagram 4: Performance Breakdown
 * Shows measured vs calculated performance metrics
 */
export async function generatePerformanceBreakdownChart(
  scenarios: ConversationScenario[],
  aggregated: AggregatedMetrics,
  outputPath: string,
  options: ChartOptions
): Promise<void> {
  const width = options.width || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;

  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });

  // Measured metrics (from quality scores) - convert 0-5 to percentage
  const attributes = getUniqueQualityAttributes(scenarios);
  const measuredMetrics: { name: string; value: number; isMeasured: boolean }[] = [];

  for (const attr of attributes.slice(0, 3)) { // Take first 3 as measured
    const scores: number[] = [];
    for (const scenario of scenarios) {
      if (scenario.qualityScores[attr]) {
        scores.push(scenario.qualityScores[attr].score);
      }
    }
    const avgScore = scores.length > 0
      ? scores.reduce((sum, s) => sum + s, 0) / scores.length
      : 0;
    const percentage = (avgScore / 5) * 100;

    measuredMetrics.push({
      name: attr.replace(/([A-Z])/g, ' $1').trim(),
      value: percentage,
      isMeasured: true
    });
  }

  // Calculated metrics
  const calculatedMetrics: { name: string; value: number; isMeasured: boolean }[] = [
    {
      name: 'Tool Efficiency',
      value: aggregated.toolSuccessRate || 0,
      isMeasured: false
    },
    {
      name: 'Completion Rate',
      value: aggregated.completionRate || 0,
      isMeasured: false
    },
    {
      name: 'Latency Performance',
      value: (aggregated.totalLatency && aggregated.totalLatency > 0)
        ? Math.max(0, Math.min(100, (1 - (aggregated.totalLatency / scenarios.length / 10000)) * 100))
        : 80,
      isMeasured: false
    }
  ];

  const allMetrics = [...measuredMetrics, ...calculatedMetrics];
  const labels = allMetrics.map(m => m.name);
  const values = allMetrics.map(m => m.value);

  // Color by performance threshold
  const colors = values.map(v => {
    if (v < 50) return COLORS.error;
    if (v < 70) return COLORS.warning;
    return COLORS.success;
  });

  const configuration: ChartConfiguration = {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Performance %',
        data: values,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.8', '1')),
        borderWidth: 3
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: options.title || 'Performance Breakdown',
          font: { size: 18, weight: 'bold' }
        },
        subtitle: options.subtitle ? {
          display: true,
          text: options.subtitle,
          font: { size: 14 }
        } : undefined,
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          max: 110,
          title: {
            display: true,
            text: 'Performance %',
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
        y: {
          ticks: {
            font: { size: 12 },
            color: '#000'
          },
          grid: {
            display: false
          }
        }
      }
    },
    plugins: [
      {
        id: 'thresholdLine',
        beforeDraw: (chart: any) => {
          const ctx = chart.ctx;
          const xAxis = chart.scales.x;
          const yAxis = chart.scales.y;

          // 70% threshold line
          const xPos = xAxis.getPixelForValue(70);
          ctx.save();
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(xPos, yAxis.top);
          ctx.lineTo(xPos, yAxis.bottom);
          ctx.stroke();
          ctx.restore();

          // Label
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.font = 'bold 12px Arial';
          ctx.fillText('70% threshold', xPos + 5, yAxis.top + 15);
        }
      },
      {
        id: 'dataLabels',
        afterDatasetsDraw: (chart: any) => {
          const ctx = chart.ctx;
          chart.data.datasets.forEach((dataset: any, i: number) => {
            const meta = chart.getDatasetMeta(i);
            meta.data.forEach((bar: any, index: number) => {
              const value = dataset.data[index] as number;
              const label = `${value.toFixed(1)}%`;
              ctx.fillStyle = '#000';
              ctx.font = 'bold 13px Arial';
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillText(label, bar.x + 5, bar.y);
            });
          });
        }
      }
    ]
  };

  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  fs.writeFileSync(outputPath, buffer);
}

// ============================================================================
// SINGLE-SCENARIO CHART FUNCTIONS
// These generate charts for individual scenarios instead of aggregated data
// ============================================================================

/**
 * Single-Scenario Version: Agent Performance vs Candidate Reference
 */
export async function generateAgentPerformanceChartSingle(
  scenario: ConversationScenario,
  outputPath: string,
  options: ChartOptions
): Promise<void> {
  const width = options.width || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;

  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });

  // Get quality attributes for this scenario, excluding candidate-related attributes
  const allAttributes = Object.keys(scenario.qualityScores).sort();
  const attributes = allAttributes.filter(attr =>
    !attr.toLowerCase().includes('candidate')
  );
  const scores = attributes.map(attr => scenario.qualityScores[attr].score);

  // Get recruiter and candidate reference scores
  const recruiterRef = scenario.overallQuality?.recruiter?.weightedAverage || null;
  const candidateRef = scenario.overallQuality?.candidate?.weightedAverage || null;

  // Color bars based on score thresholds
  const barColors = scores.map(score => {
    if (score < 3) return COLORS.error;
    if (score < 4) return COLORS.warning;
    return COLORS.success;
  });

  const configuration: ChartConfiguration = {
    type: 'bar',
    data: {
      labels: attributes.map(attr => attr.replace(/([A-Z])/g, ' $1').trim()),
      datasets: [
        {
          label: 'Quality Score',
          data: scores,
          backgroundColor: barColors,
          borderColor: barColors.map(c => c.replace('0.8', '1')),
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: options.title || `Agent Performance - ${scenario.scenarioId}`,
          font: { size: 18, weight: 'bold' }
        },
        subtitle: options.subtitle ? {
          display: true,
          text: options.subtitle,
          font: { size: 14 }
        } : undefined,
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
            text: 'Score (0-5)',
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
          grid: {
            display: false
          }
        }
      }
    },
    plugins: [
      {
        id: 'referenceLines',
        beforeDraw: (chart: any) => {
          const ctx = chart.ctx;
          const yAxis = chart.scales.y;
          const xAxis = chart.scales.x;

          // Recruiter reference line (orange dotted)
          if (recruiterRef !== null && recruiterRef !== undefined) {
            const yPos = yAxis.getPixelForValue(recruiterRef);
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 159, 64, 0.8)'; // Orange
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(xAxis.left, yPos);
            ctx.lineTo(xAxis.right, yPos);
            ctx.stroke();
            ctx.restore();

            // Label
            ctx.fillStyle = 'rgba(255, 159, 64, 1)';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(`Recruiter: ${recruiterRef.toFixed(1)}`, xAxis.right - 150, yPos + 15);
          }

          // Candidate reference line (blue dotted)
          if (candidateRef !== null && candidateRef !== undefined) {
            const yPos = yAxis.getPixelForValue(candidateRef);
            ctx.save();
            ctx.strokeStyle = 'rgba(54, 162, 235, 0.8)'; // Blue
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(xAxis.left, yPos);
            ctx.lineTo(xAxis.right, yPos);
            ctx.stroke();
            ctx.restore();

            // Label
            ctx.fillStyle = 'rgba(54, 162, 235, 1)';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(`Candidate: ${candidateRef.toFixed(1)}`, xAxis.right - 150, yPos - 5);
          }

          // Target line at 4.0
          const target = yAxis.getPixelForValue(4.0);
          ctx.save();
          ctx.strokeStyle = 'rgba(75, 192, 75, 0.5)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(xAxis.left, target);
          ctx.lineTo(xAxis.right, target);
          ctx.stroke();
          ctx.restore();

          // Baseline line at 3.0
          const baseline = yAxis.getPixelForValue(3.0);
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 206, 86, 0.5)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(xAxis.left, baseline);
          ctx.lineTo(xAxis.right, baseline);
          ctx.stroke();
          ctx.restore();
        }
      },
      {
        id: 'dataLabels',
        afterDatasetsDraw: (chart: any) => {
          const ctx = chart.ctx;
          chart.data.datasets.forEach((dataset: any, i: number) => {
            const meta = chart.getDatasetMeta(i);
            meta.data.forEach((bar: any, index: number) => {
              const data = dataset.data[index] as number;
              if (data !== null && data !== undefined) {
                ctx.fillStyle = '#000';
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText(data.toFixed(1), bar.x, bar.y - 5);
              }
            });
          });
        }
      }
    ]
  };

  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  fs.writeFileSync(outputPath, buffer);
}

/**
 * Single-Scenario Version: Conversation Stage Distribution
 */
export async function generateStageDistributionChartSingle(
  scenario: ConversationScenario,
  outputPath: string,
  options: ChartOptions
): Promise<void> {
  const width = options.width || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;

  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });

  // Analyze stages for this scenario only
  const distribution = analyzeConversationStages([scenario]);
  const total = Object.values(distribution).reduce((sum, val) => sum + val, 0);

  const stages = ['Initial', 'Screening', 'Requirements', 'Consent', 'Rejected'];
  const counts = stages.map(stage => distribution[stage as keyof typeof distribution]);
  const percentages = counts.map(count => total > 0 ? (count / total) * 100 : 0);

  // Color coding
  const colors = percentages.map((pct, idx) => {
    const stage = stages[idx];
    if (stage === 'Initial' || stage === 'Screening') return COLORS.success;
    if (stage === 'Requirements') return COLORS.warning;
    if (stage === 'Rejected') return COLORS.error;
    return COLORS.gray;
  });

  const configuration: ChartConfiguration = {
    type: 'bar',
    data: {
      labels: stages,
      datasets: [{
        label: '% of Turns',
        data: percentages,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.8', '1')),
        borderWidth: 2
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: options.title || `Stage Distribution - ${scenario.scenarioId}`,
          font: { size: 18, weight: 'bold' }
        },
        subtitle: options.subtitle ? {
          display: true,
          text: options.subtitle,
          font: { size: 14 }
        } : undefined,
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: (value) => `${value}%`,
            font: { size: 12 },
            color: '#000'
          },
          title: {
            display: true,
            text: 'Percentage of Total Turns',
            font: { size: 14 },
            color: '#000'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        },
        y: {
          ticks: {
            font: { size: 12 },
            color: '#000'
          },
          grid: {
            display: false
          }
        }
      }
    },
    plugins: [{
      id: 'dataLabels',
      afterDatasetsDraw: (chart: any) => {
        const ctx = chart.ctx;
        chart.data.datasets.forEach((dataset: any, i: number) => {
          const meta = chart.getDatasetMeta(i);
          meta.data.forEach((bar: any, index: number) => {
            const pct = dataset.data[index] as number;
            const count = counts[index];
            const label = `${pct.toFixed(1)}% (${count} turns)`;
            ctx.fillStyle = '#000';
            ctx.font = 'bold 13px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, bar.x + 5, bar.y);
          });
        });
      }
    }]
  };

  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  fs.writeFileSync(outputPath, buffer);
}

/**
 * Single-Scenario Version: Known Costs
 */
export async function generateKnownCostsChartSingle(
  scenario: ConversationScenario,
  outputPath: string,
  options: ChartOptions
): Promise<void> {
  const width = options.width || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;

  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });

  const totalTurns = scenario.turns.length;
  const isCompleted = scenario.metrics.completionRate === 100;

  const costPerConv = scenario.metrics.totalCost;
  const costPerTurn = totalTurns > 0 ? scenario.metrics.totalCost / totalTurns : 0;
  const costPerSuccess = isCompleted ? scenario.metrics.totalCost : 0;

  const labels = ['Per Conversation', 'Per Turn', 'Per Success'];
  const data = [costPerConv, costPerTurn, costPerSuccess];
  const displayLabels = data.map((cost, idx) =>
    idx === 2 && !isCompleted ? 'N/A' : `$${cost.toFixed(4)}`
  );

  const configuration: ChartConfiguration = {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Cost (USD)',
        data: data.map((cost, idx) => idx === 2 && !isCompleted ? 0 : cost),
        backgroundColor: [COLORS.info, COLORS.success, COLORS.warning],
        borderColor: [COLORS.info, COLORS.success, COLORS.warning].map(c => c.replace('0.8', '1')),
        borderWidth: 2
      }]
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: options.title || `Known Costs - ${scenario.scenarioId}`,
          font: { size: 18, weight: 'bold' }
        },
        subtitle: options.subtitle ? {
          display: true,
          text: options.subtitle,
          font: { size: 14 }
        } : undefined,
        legend: {
          display: false
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
            callback: (value) => `$${Number(value).toFixed(4)}`,
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
            display: false
          }
        }
      }
    },
    plugins: [{
      id: 'dataLabels',
      afterDatasetsDraw: (chart: any) => {
        const ctx = chart.ctx;
        chart.data.datasets.forEach((dataset: any, i: number) => {
          const meta = chart.getDatasetMeta(i);
          meta.data.forEach((bar: any, index: number) => {
            const label = displayLabels[index];
            ctx.fillStyle = '#000';
            ctx.font = 'bold 14px Arial';
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
}

/**
 * Single-Scenario Version: Stage Costs (Approximated)
 */
export async function generateStageCostsChartSingle(
  scenario: ConversationScenario,
  outputPath: string,
  options: ChartOptions
): Promise<void> {
  const width = options.width || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;

  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });

  // Analyze stages for this scenario
  const distribution = analyzeConversationStages([scenario]);
  const totalTurns = Object.values(distribution).reduce((sum, val) => sum + val, 0);

  const stages = ['Initial', 'Screening', 'Requirements', 'Consent', 'Rejected'];
  const stageCosts = stages.map(stage => {
    const turns = distribution[stage as keyof typeof distribution];
    return totalTurns > 0 ? (turns / totalTurns) * scenario.metrics.totalCost : 0;
  });

  const configuration: ChartConfiguration = {
    type: 'bar',
    data: {
      labels: stages,
      datasets: [{
        label: 'Estimated Cost (USD)',
        data: stageCosts,
        backgroundColor: [
          COLORS.success,
          COLORS.success,
          COLORS.warning,
          COLORS.gray,
          COLORS.error
        ],
        borderColor: [
          COLORS.success,
          COLORS.success,
          COLORS.warning,
          COLORS.gray,
          COLORS.error
        ].map(c => c.replace('0.8', '1')),
        borderWidth: 2
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: options.title || `Cost by Stage - ${scenario.scenarioId}`,
          font: { size: 18, weight: 'bold' }
        },
        subtitle: {
          display: true,
          text: options.subtitle || '⚠ Approximation: Assumes equal cost per turn',
          font: { size: 12 },
          color: '#ff6b6b'
        },
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Cost (USD)',
            font: { size: 14 },
            color: '#000'
          },
          ticks: {
            callback: (value) => `$${Number(value).toFixed(4)}`,
            font: { size: 12 },
            color: '#000'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        },
        y: {
          ticks: {
            font: { size: 12 },
            color: '#000'
          },
          grid: {
            display: false
          }
        }
      }
    },
    plugins: [{
      id: 'dataLabels',
      afterDatasetsDraw: (chart: any) => {
        const ctx = chart.ctx;
        chart.data.datasets.forEach((dataset: any, i: number) => {
          const meta = chart.getDatasetMeta(i);
          meta.data.forEach((bar: any, index: number) => {
            const cost = dataset.data[index] as number;
            const label = `$${cost.toFixed(4)}`;
            ctx.fillStyle = '#000';
            ctx.font = 'bold 13px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, bar.x + 5, bar.y);
          });
        });
      }
    }]
  };

  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  fs.writeFileSync(outputPath, buffer);
}

/**
 * Single-Scenario Version: Performance Breakdown
 */
export async function generatePerformanceBreakdownChartSingle(
  scenario: ConversationScenario,
  outputPath: string,
  options: ChartOptions
): Promise<void> {
  const width = options.width || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;

  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });

  // Measured metrics (from quality scores) - convert 0-5 to percentage
  const attributes = Object.keys(scenario.qualityScores).sort();
  const measuredMetrics: { name: string; value: number }[] = [];

  for (const attr of attributes.slice(0, 3)) { // Take first 3 as measured
    const score = scenario.qualityScores[attr].score;
    const percentage = (score / 5) * 100;

    measuredMetrics.push({
      name: attr.replace(/([A-Z])/g, ' $1').trim(),
      value: percentage
    });
  }

  // Calculated metrics
  const calculatedMetrics: { name: string; value: number }[] = [
    {
      name: 'Tool Efficiency',
      value: scenario.metrics.toolSuccessRate || 0
    },
    {
      name: 'Completion Rate',
      value: scenario.metrics.completionRate || 0
    },
    {
      name: 'Latency Performance',
      value: (scenario.metrics.totalLatency && scenario.metrics.totalLatency > 0)
        ? Math.max(0, Math.min(100, (1 - (scenario.metrics.totalLatency / 10000)) * 100))
        : 80
    }
  ];

  const allMetrics = [...measuredMetrics, ...calculatedMetrics];
  const labels = allMetrics.map(m => m.name);
  const values = allMetrics.map(m => m.value);

  // Color by performance threshold
  const colors = values.map(v => {
    if (v < 50) return COLORS.error;
    if (v < 70) return COLORS.warning;
    return COLORS.success;
  });

  const configuration: ChartConfiguration = {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Performance %',
        data: values,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.8', '1')),
        borderWidth: 3
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: options.title || `Performance Breakdown - ${scenario.scenarioId}`,
          font: { size: 18, weight: 'bold' }
        },
        subtitle: options.subtitle ? {
          display: true,
          text: options.subtitle,
          font: { size: 14 }
        } : undefined,
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          max: 110,
          title: {
            display: true,
            text: 'Performance %',
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
        y: {
          ticks: {
            font: { size: 12 },
            color: '#000'
          },
          grid: {
            display: false
          }
        }
      }
    },
    plugins: [
      {
        id: 'thresholdLine',
        beforeDraw: (chart: any) => {
          const ctx = chart.ctx;
          const xAxis = chart.scales.x;
          const yAxis = chart.scales.y;

          // 70% threshold line
          const xPos = xAxis.getPixelForValue(70);
          ctx.save();
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(xPos, yAxis.top);
          ctx.lineTo(xPos, yAxis.bottom);
          ctx.stroke();
          ctx.restore();

          // Label
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.font = 'bold 12px Arial';
          ctx.fillText('70% threshold', xPos + 5, yAxis.top + 15);
        }
      },
      {
        id: 'dataLabels',
        afterDatasetsDraw: (chart: any) => {
          const ctx = chart.ctx;
          chart.data.datasets.forEach((dataset: any, i: number) => {
            const meta = chart.getDatasetMeta(i);
            meta.data.forEach((bar: any, index: number) => {
              const value = dataset.data[index] as number;
              const label = `${value.toFixed(1)}%`;
              ctx.fillStyle = '#000';
              ctx.font = 'bold 13px Arial';
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillText(label, bar.x + 5, bar.y);
            });
          });
        }
      }
    ]
  };

  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  fs.writeFileSync(outputPath, buffer);
}

