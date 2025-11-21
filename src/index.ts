import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { TestRunner } from './core/TestRunner';
import { AgentTestRunner } from './core/AgentTestRunner';
import { ConversationEvaluationRunner } from './core/ConversationEvaluationRunner';
import { AgentRerunRunner } from './core/AgentRerunRunner';
import { AgentSimulationRunner } from './core/AgentSimulationRunner';
import { Logger } from './utils/logger';
import { EnvLoader } from './utils/env-loader';

async function main() {
  const args = process.argv.slice(2);
  const envArg = args.find(arg => arg.startsWith('--env='));
  const environment = envArg ? envArg.split('=')[1] : undefined;

  EnvLoader.load(environment);

  const tenantArg = args.find(arg => arg.startsWith('--tenant='));

  if (!tenantArg) {
    Logger.error('Usage: tsx src/index.ts --tenant=<tenant-name>');
    process.exit(1);
  }

  const tenantName = tenantArg.split('=')[1];

  try {
    // Load config to determine test type
    const configPath = `./tenants/${tenantName}/config.yaml`;
    const config = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any;

    // Use appropriate runner based on test type
    const testType = config.testPlan?.type || 'text-generation'; // Default to text-generation for backward compatibility
    const validTestTypes = [
      'text-generation',
      'agent-scenario',
      'conversation-evaluation',
      'agent-rerun',
      'agent-simulation',
    ];

    // Validate testType
    if (!validTestTypes.includes(testType)) {
      Logger.error(`[Main] ✗ Invalid testPlan.type: "${testType}"`);
      Logger.error(`[Main] Valid values: ${validTestTypes.join(', ')}`);
      Logger.error(`[Main] Please check your config.yaml file`);
      process.exit(1);
    }

    if (testType === 'agent-scenario') {
      Logger.info(`[Main] Test type: agent-scenario - using AgentTestRunner`);
      const runner = new AgentTestRunner();
      await runner.run(tenantName);
    } else if (testType === 'conversation-evaluation') {
      Logger.info(`[Main] Test type: conversation-evaluation - using ConversationEvaluationRunner`);
      const runner = new ConversationEvaluationRunner();
      await runner.run(tenantName);
    } else if (testType === 'agent-rerun') {
      Logger.info(`[Main] Test type: agent-rerun - using AgentRerunRunner`);
      const runner = new AgentRerunRunner();
      await runner.run(tenantName);
    } else if (testType === 'agent-simulation') {
      Logger.info(`[Main] Test type: agent-simulation - using AgentSimulationRunner`);
      const runner = new AgentSimulationRunner();
      await runner.run(tenantName);
    } else {
      Logger.info(`[Main] Test type: ${testType} - using TestRunner`);
      const runner = new TestRunner();
      await runner.run(tenantName);
    }

    // Exit cleanly after successful completion
    process.exit(0);
  } catch (error) {
    Logger.error('Assessment failed', error);
    process.exit(1);
  }
}

main();
