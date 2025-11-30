# @ai-test-harness/core

[![npm version](https://badge.fury.io/js/%40ai-test-harness%2Fcore.svg)](https://www.npmjs.com/package/@ai-test-harness/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Core framework for AI quality testing with AWS Bedrock.

## Installation

```bash
npm install @ai-test-harness/core
```

## Usage

### Programmatic API

```typescript
import { runTests, LLMClientFactory, MockAdapter } from '@ai-test-harness/core';

// Run tests for a project
const result = await runTests({
  projectPath: './my-tests',
  configFile: 'config.yaml',
});

// Use LLM client directly
const client = LLMClientFactory.create({
  provider: 'bedrock',
  region: 'us-east-2',
});

const response = await client.chat({
  model: 'us.anthropic.claude-3-5-sonnet-20240620-v1:0',
  messages: [{ role: 'user', content: 'Hello!' }],
  temperature: 0.7,
  maxTokens: 1000,
});

// Unit testing with mock adapter
const mockClient = new MockAdapter();
mockClient.setDefaultResponse('Test response');
```

## Exports

### Test Runners
- `TestRunner` - For text-generation tests
- `AgentTestRunner` - For agent scenario tests  
- `AgentSimulationRunner` - For dynamic agent simulation

### LLM Components
- `LLMJudge` - Evaluates outputs against quality criteria
- `LLMGenerator` - Generates text from prompts
- `UserSimulator` - Simulates user responses

### LLM Client Abstraction
- `ILLMClient` - Interface for LLM clients
- `LLMClientFactory` - Factory for creating clients
- `BedrockAdapter` - AWS Bedrock implementation
- `LiteLLMAdapter` - LiteLLM HTTP implementation
- `MockAdapter` - Testing mock

### Quality Library
- `registerAttribute()` - Register custom quality attributes
- `generateAssessmentPrompt()` - Generate evaluation prompts
- `buildQualitySchema()` - Build Zod schemas for validation

### Utilities
- `Logger` - Structured logging
- `ConfigLoader` - Load YAML configurations
- `retryWithBackoff()` - Resilient API calls

## Environment Variables

```bash
# LLM Provider (default: bedrock)
LLM_PROVIDER=bedrock

# For LiteLLM integration
LITELLM_URL=https://litellm.company.com
LITELLM_API_KEY=sk-xxx

# AWS configuration
AWS_REGION=us-east-2
```

## Documentation

For complete documentation, see the [main repository](https://github.com/c2pig/ai-test-harness).

## Contributing

See [CONTRIBUTING.md](https://github.com/c2pig/ai-test-harness/blob/main/CONTRIBUTING.md) in the main repository.

## License

MIT © AI Test Harness Contributors

