# @ai-test-harness/cli

[![npm version](https://badge.fury.io/js/%40ai-test-harness%2Fcli.svg)](https://www.npmjs.com/package/@ai-test-harness/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Command-line interface for AI Test Harness - scaffold and run AI quality tests.

## Installation

```bash
npm install -g @ai-test-harness/cli
# or use npx
npx @ai-test-harness/cli <command>
```

## Commands

### Create New Project

```bash
# Interactive mode
ai-test-harness new my-llm-tests

# Non-interactive with defaults
ai-test-harness new my-llm-tests -y

# Specify test type
ai-test-harness new my-tests --type=agent-simulation

# Use minimal template
ai-test-harness new my-tests --template=minimal
```

### Run Tests

```bash
# Run with default config
ai-test-harness run

# Specify config file
ai-test-harness run --config=staging.yaml

# Override model
ai-test-harness run --model=claude-3-5-sonnet

# Verbose output
ai-test-harness run --verbose
```

### Validate Configuration

```bash
ai-test-harness validate
ai-test-harness validate --config=staging.yaml
```

### Add Scaffolding

```bash
# Add custom quality attribute
ai-test-harness add quality ResponseQuality

# Add test scenario
ai-test-harness add scenario edge-case-test

# Add data connector
ai-test-harness add connector production-logs
```

## Generated Project Structure

```
my-llm-tests/
├── config.yaml           # Main configuration
├── custom/
│   ├── pricing.yaml      # Custom model pricing
│   ├── prompts.yaml      # Prompt definitions
│   ├── connectors.yaml   # Data source connectors
│   └── qualities/        # Custom quality attributes
│       └── ExampleQuality.ts
├── data/                 # Test data files
├── calibration/          # Judge calibration
├── scenarios/            # Test scenarios (agent tests)
├── outputs/              # Test outputs (gitignored)
├── package.json
└── README.md
```

## Example Workflow

```bash
# 1. Create new project
ai-test-harness new my-llm-tests
cd my-llm-tests

# 2. Install dependencies
npm install

# 3. Configure your tests
# Edit config.yaml, add data, customize qualities

# 4. Validate configuration
npm run validate

# 5. Run tests
npm test
```

## Documentation

For complete documentation, see the [main repository](https://github.com/c2pig/ai-test-harness).

## Contributing

See [CONTRIBUTING.md](https://github.com/c2pig/ai-test-harness/blob/main/CONTRIBUTING.md) in the main repository.

## License

MIT © AI Test Harness Contributors

