#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

interface TenantConfig {
  name: string;
  description: string;
  type: 'text-generation' | 'agent-scenario';
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

/**
 * Check if npm scripts for the tenant already exist in package.json
 */
function scriptsExist(name: string): boolean {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    return !!(packageJson.scripts && packageJson.scripts[`test:${name}`]);
  } catch (_error) {
    console.warn('Warning: Could not read package.json to check for existing scripts');
    return false;
  }
}

/**
 * Add npm scripts to package.json for the new tenant
 */
function addNpmScripts(name: string): void {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    if (!packageJson.scripts) {
      packageJson.scripts = {};
    }

    // Add the test and validate scripts
    const newScripts = {
      [`test:${name}`]: `tsx src/index.ts --tenant=${name}`,
      [`validate:${name}`]: `tsx src/cli/e2e-validator.ts outputs/${name}`,
      // [`test:${name}:staging`]: `tsx src/index.ts --tenant=${name} --env=staging`,
      // [`test:${name}:production`]: `tsx src/index.ts --tenant=${name} --env=production`,
    };

    // Insert scripts in order (after other test:/validate: scripts, before create-tenant)
    const orderedScripts: Record<string, string> = {};
    let insertedNewScripts = false;

    for (const [key, value] of Object.entries(packageJson.scripts)) {
      // Add existing script
      orderedScripts[key] = value as string;

      // If this is the last test: or validate: script before create-tenant, insert new scripts after it
      if ((key.startsWith('test:') || key.startsWith('validate:')) && !insertedNewScripts) {
        // Check if the next key is create-tenant or not a test:/validate: script
        const keys = Object.keys(packageJson.scripts);
        const currentIndex = keys.indexOf(key);
        const nextKey = keys[currentIndex + 1];

        if (!nextKey || (!nextKey.startsWith('test:') && !nextKey.startsWith('validate:'))) {
          // Insert new scripts here
          Object.assign(orderedScripts, newScripts);
          insertedNewScripts = true;
        }
      }
    }

    // If we didn't insert yet (no test:/validate: scripts exist), insert before create-tenant
    if (!insertedNewScripts) {
      Object.assign(orderedScripts, newScripts);
    }

    packageJson.scripts = orderedScripts;

    // Write back to package.json with proper formatting
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

    console.log('\n✓ Added npm scripts to package.json:');
    console.log(`  - test:${name}`);
    console.log(`  - validate:${name}`);
  } catch (error: any) {
    console.error(`\n⚠ Warning: Could not update package.json automatically`);
    console.error(`  Error: ${error.message}`);
    console.log(`\nPlease manually add these scripts to package.json:`);
    console.log(`  "test:${name}": "tsx src/index.ts --tenant=${name}",`);
    console.log(`  "validate:${name}": "tsx src/cli/e2e-validator.ts outputs/${name}"`);
  }
}

async function createTenant() {
  console.log('\n========================================');
  console.log('Create New Tenant');
  console.log('========================================\n');

  const name = await question('Tenant name (kebab-case, e.g., "job-description"): ');

  if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
    console.error('Error: Invalid tenant name. Use kebab-case (e.g., "job-description")');
    rl.close();
    process.exit(1);
  }

  const tenantDir = path.join(process.cwd(), 'tenants', name);

  if (fs.existsSync(tenantDir)) {
    console.error(`Error: Tenant "${name}" already exists`);
    rl.close();
    process.exit(1);
  }

  // Check if scripts already exist in package.json
  if (scriptsExist(name)) {
    console.error(`Error: npm scripts for tenant "${name}" already exist in package.json`);
    console.error(`Please remove them first or choose a different tenant name`);
    rl.close();
    process.exit(1);
  }

  const description = await question('Description: ');

  console.log('\nSelect test type:');
  console.log('1. text-generation (LLM prompt-based generation with quality assessment)');
  console.log('2. agent-scenario (Bedrock Agent conversational testing with scenarios)');
  const typeChoice = await question('\nChoice (1 or 2): ');

  const type = typeChoice === '2' ? 'agent-scenario' : 'text-generation';

  console.log(`\n✓ Creating tenant: ${name}`);
  console.log(`  Type: ${type}`);
  console.log(`  Description: ${description}\n`);

  // Create directory structure
  fs.mkdirSync(tenantDir, { recursive: true });
  fs.mkdirSync(path.join(tenantDir, 'evaluation'), { recursive: true });

  if (type === 'agent-scenario') {
    fs.mkdirSync(path.join(tenantDir, 'scenarios', 'positive-tests'), { recursive: true });
    fs.mkdirSync(path.join(tenantDir, 'scenarios', 'negative-tests'), { recursive: true });
  }

  // Create config.yaml
  const configContent = generateConfigYAML({ name, description, type });
  fs.writeFileSync(path.join(tenantDir, 'config.yaml'), configContent);

  // Create calibration.yaml
  const calibrationContent = generateCalibrationYAML(type);
  fs.writeFileSync(path.join(tenantDir, 'evaluation', 'calibration.yaml'), calibrationContent);

  // Create sample scenario for agent-scenario
  if (type === 'agent-scenario') {
    const sampleScenario = generateSampleScenario(name);
    fs.writeFileSync(
      path.join(tenantDir, 'scenarios', 'positive-tests', 'sample-scenario.yaml'),
      sampleScenario
    );
  }

  console.log('✓ Tenant created successfully!\n');
  console.log('Directory structure:');
  console.log(`  tenants/${name}/`);
  console.log(`  ├── config.yaml`);
  console.log(`  └── evaluation/`);
  console.log(`      └── calibration.yaml`);

  if (type === 'agent-scenario') {
    console.log(`  └── scenarios/`);
    console.log(`      ├── positive-tests/`);
    console.log(`      │   └── sample-scenario.yaml`);
    console.log(`      └── negative-tests/`);
  }

  // Add npm scripts to package.json
  addNpmScripts(name);

  console.log('\nNext steps:');
  console.log(`1. Edit tenants/${name}/config.yaml to configure your test plan`);
  console.log(`2. Edit tenants/${name}/evaluation/calibration.yaml to add calibration examples`);

  if (type === 'agent-scenario') {
    console.log(`3. Add test scenarios to tenants/${name}/scenarios/`);
    console.log(`4. Update the agent connector in tenants/${name}/config.yaml`);
    console.log(`5. Run tests: npm run test:${name}`);
  } else {
    console.log(`3. Create your prompt file at custom/prompts/local.development.txt`);
    console.log(
      `4. Create your test data at custom/data/local.development.json (array of test cases)`
    );
    console.log(`5. Run tests: npm run test:${name}`);
    console.log(
      `\n   Note: The tenant is pre-configured to use local-example-prompt and local-example-data.`
    );
    console.log(
      `   To use different connectors, update config.yaml to reference other entries from:`
    );
    console.log(`   - config/shared/prompts.yaml (for prompt connectors)`);
    console.log(`   - config/shared/connectors.yaml (for data connectors)`);
  }

  rl.close();
}

function generateConfigYAML(config: TenantConfig): string {
  if (config.type === 'agent-scenario') {
    return `# Project Configuration
schemaVersion: "1.0.0"

project:
  name: ${config.name}
  description: ${config.description}

testPlan:
  type: agent-scenario
  agent: YOUR_AGENT_NAME  # Update this to match your agent in config/shared/models.yaml
  scenariosPath: "./scenarios/**/*.yaml"

evaluationPlan:
  judgeModel:
    modelId: bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0

  qualityAssessment:
    attributes:
      - FlowAdherence
      - EscalationHandling
      - ActionExecution
      - ResponseQuality
      - QuestioningStrategy
      - EvidenceGathering
      - RequirementAlignment

    solutionDescription: "${config.description}"
    calibrationPath: "./evaluation/calibration.yaml"
`;
  } else {
    return `# Project Configuration
schemaVersion: "1.0.0"

project:
  name: ${config.name}
  description: ${config.description}

testPlan:
  type: text-generation

  # Prompt connector references a prompt definition from config/shared/prompts.yaml
  # The default 'local-example-prompt' uses a local file at local/examples/prompts/local.development.txt
  prompt: local-example-prompt

  connectors:
    # Data connector references a connector from config/shared/connectors.yaml
    # The default 'local-example-data' uses local JSON files in local/examples/data-sample/cloudwatch.json
    logs: local-example-data

  # LLM configuration for text generation
  llmConfig:
    modelId: bedrock:amazon.nova-lite-v1:0
    # modelId: bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0
    temperature: 0.7
    topP: 0.8
    maxTokens: 4000

evaluationPlan:
  # Judge model evaluates the quality of generated text
  judgeModel:
    modelId: bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0

  qualityAssessment:
    attributes:
      - ZeroHallucination  # Add your quality attributes here (see config/quality/ for available attributes)

    solutionDescription: "${config.description}"
    calibrationPath: "./evaluation/calibration.yaml"
`;
  }
}

function generateCalibrationYAML(type: string): string {
  if (type === 'agent-scenario') {
    return `# Calibration examples for the judge model
# These examples help the judge understand what different quality levels look like
# For more examples, see existing tenants like product-outreach-simulation

enabled: true

examples:
  - category: reference-excellent-execution
    description: Example of excellent performance across all quality dimensions
    characteristics:
      - Demonstrates best practices for all evaluated attributes
      - Shows ideal behavior patterns
      - Achieves optimal outcomes efficiently
    expectedRating:
      FlowAdherence: 5
      ResponseQuality: 5
      # Add ratings for other attributes configured in config.yaml

  - category: reference-needs-improvement
    description: Example showing common issues that need improvement
    characteristics:
      - Contains typical mistakes or suboptimal approaches
      - Demonstrates areas requiring attention
      - May have compliance or quality issues
    expectedRating:
      FlowAdherence: 2
      ResponseQuality: 2
      # Add ratings for other attributes configured in config.yaml
`;
  } else {
    // Text-generation format
    return `# Calibration examples for the judge model
# These examples help the judge understand what different quality levels look like
#
# Customize these examples based on your specific use case and quality attributes

enabled: true

examples:
  - category: "no hallucination"
    description: "Example of high-quality output that meets all expectations"
    characteristics:
      - "Demonstrates accurate and factual information"
      - "Well-structured and clearly formatted"
      - "Comprehensive coverage of required content"
      - "Professional tone and appropriate language"
    expectedRating:
      ZeroHallucination: 5
      # Add ratings for other quality attributes configured in config.yaml

  - category: "hallucination present"
    description: "Example of poor-quality output with significant issues"
    characteristics:
      - "Contains fabricated or inaccurate information"
      - "Poorly organized or inconsistent formatting"
      - "Missing critical content or details"
      - "Inappropriate tone or unprofessional language"
    expectedRating:
      ZeroHallucination: 2
      # Add ratings for other quality attributes configured in config.yaml
`;
  }
}

function generateSampleScenario(tenantName: string): string {
  return `scenarioId: sample-scenario
description: Sample test scenario for ${tenantName}

# Conversation style examples (adapt based on scenario intent)
conversationExamples:
  - user: "Hello"
  - user: "I have a question"
  - user: "Thank you"

# Optional: User persona (preferences, characteristics, opinions)
# Only sent to simulator LLM, NOT to judge LLM
# persona:
#   - You are curious and engaged about this opportunity
#   - You communicate in a direct and professional manner
#   - You prioritize work-life balance and career growth

# Optional: Factual background data (qualifications, experience, location)
# Sent to BOTH simulator and judge LLM
# candidateDetails:
#   name: "John Doe"
#   location: "San Francisco, CA"
#   experience_years: 5

# Optional: Additional context data
contextData:
  # Add context data that will be injected into the conversation
  exampleField: "example value"

validations:
  # Deterministic validations that are programmatically checked
  toolCalls:
    - ExampleTool  # Optional: List expected tool calls
  escalation: false
  # escalationType: "type"  # Optional: Expected escalation type

acceptanceCriteria:
  # Natural language expectations for the LLM judge to assess
  - Agent should respond politely to greetings
  - Agent should address the candidate's question appropriately
  - Agent should conclude the conversation professionally
`;
}

createTenant().catch(error => {
  console.error('Error creating tenant:', error);
  rl.close();
  process.exit(1);
});
