# AI-Test-Harness Test Harness

Command-line utilities for managing the testing framework. These tools help you create tenants, validate configs, check schema versions, and clean up outputs.

## Quick Reference

| Command | npm script | What it does |
|---------|-----------|-------------|
| create-tenant | `npm run create-tenant` | Interactive wizard to create new tenant with configs |
| validate-configs | `npm run validate` | Validate all configuration files using Zod schemas |
| show-schema-version | `npm run schema:version` | Display current schema version and compatibility |
| clean:outputs | `npm run clean:outputs` | Remove all output folders from tenants |

---


## Common Workflows

### Creating and running a new test suite

```bash
# 1. Create tenant
npm run create-tenant
# Follow cli prompt instruction
# << your input is "my-tenant"
# 2. Edit config
vi tenants/my-tenant/config.yaml

# 3. Validate before running
npm run validate

# 4. Run tests
npm run test:my-tenant
```

### Validating configs before commit

```bash
# Good practice: always validate before committing
npm run validate


### Cleaning up after testing

```bash
# Clean all outputs
npm run clean:outputs
# Output: "All output folders cleaned"
```

### Checking schema compatibility

```bash
# Check current schema version
npm run schema:version

# If you're upgrading, check docs first
cat docs/config-schema.md
```

## create-tenant

Creates a new tenant directory with all necessary configuration files. This is the starting point for any new test suite.

### Usage

```bash
npm run create-tenant
```

The script will prompt you for:
1. **Tenant name** (kebab-case, e.g., "job-description")
2. **Description** (short description of what this tenant tests)
3. **Test type**:
   - `text-generation`: LLM prompt-based generation with quality assessment
   - `agent-scenario`: Bedrock Agent conversational testing with scenarios

### What it creates

For **text-generation** tenants:
```
tenants/your-tenant-name/
├── config.yaml              # Main configuration
└── evaluation/
    └── calibration.yaml     # Calibration examples for judge
```

For **agent-scenario** tenants:
```
tenants/your-tenant-name/
├── config.yaml              # Main configuration
├── evaluation/
│   └── calibration.yaml     # Calibration examples for judge
└── scenarios/
    ├── positive-tests/
    │   └── sample-scenario.yaml
    └── negative-tests/
```

---

## validate-configs

Validates all configuration files in the repository using Zod schemas. This catches errors before you run tests.

### Usage

```bash
npm run validate
```

This command runs both:
- Type checking (`tsc --noEmit`)
- Configuration validation (Zod schema validation)

### What it validates

The validator runs **7 validation phases**:

1. **Shared Models** (`config/shared/models.yaml`)
   - Validates all model definitions (bedrock-agent, prompt types)
   - Checks required fields (agentId, promptPath, inputKeys, etc.)

2. **Shared Connectors** (`config/shared/connectors.yaml`)
   - Validates all connector definitions (cloudwatch, dynamodb, postgresql, etc.)
   - Checks outputSchema is defined for data connectors
   - Validates recordKey is specified

3. **Framework Configs**
   - Checks framework prompt files exist

4. **Tenant Configs** (`tenants/*/config.yaml`)
   - Validates schema version compatibility
   - Checks config structure matches test type
   - Validates quality attributes are defined
   - Ensures all required fields are present

5. **Scenario Files** (`tenants/*/scenarios/**/*.yaml`)
   - Validates scenario structure
   - Checks required fields (scenarioId, description, conversationExamples)
   - Validates tool call expectations format

6. **Calibration Files** (`tenants/*/evaluation/calibration.yaml`)
   - Validates calibration example structure
   - Checks grade-score mappings

7. **Cross-References**
   - Verifies referenced models exist in models.yaml
   - Verifies referenced connectors exist in connectors.yaml
   - Ensures no dangling references

### Example output

**Success:**
```
=== Configuration Validator ===

[1/7] Validating shared configuration files...
  ✓ models.yaml: 5 models defined
  ✓ connectors.yaml: 8 connectors defined

[2/7] Checking framework configs...
  ✓ Found 3 framework prompt files

[3/7] Validating tenant configuration files...
  Found 3 tenant configs
  ✓ product-listing: valid (schemaVersion: 1.0.0)
  ✓ product-outreach-scenario: valid (schemaVersion: 1.0.0)

[4/7] Validating scenario files...
  ✓ 12 scenario files validated

[5/7] Validating calibration files...
  ✓ 3 calibration files validated

[6/7] Validating cross-references...
  ✓ All model references valid
  ✓ All connector references valid

[7/7] Summary
  ✓ All validations passed
```

**Failure:**
```
=== Configuration Validator ===

[1/7] Validating shared configuration files...
  ✗ connectors.yaml [connectors.prod-cloudwatch]: recordKey is required

[3/7] Validating tenant configuration files...
  ✗ product-listing:
     [evaluationPlan.judgeModel.maxTokens]: Expected number, got undefined

✗ Validation failed with 2 errors
```

### Exit codes

- **0** = All validations passed
- **1** = Validation failed (errors found)

Use this in CI/CD pipelines to prevent deploying broken configs.

---

## show-schema-version

Displays the current schema version and all supported versions. Use this to check compatibility when upgrading configs.

### Usage

```bash
npm run schema:version
```

### Example output

```
============================================================
Configuration Schema Version
============================================================

Current Version: 1.0.0

Supported Versions:
  → 1.0.0 (current)

For schema documentation, see:
  docs/config-schema.md
```

### When to use this

- Before upgrading the framework to check if your configs need migration
- When debugging schema version errors
- To verify which schema features are available

---

## clean:outputs

Removes all output folders from tenant directories. Use this to free up disk space or start fresh.

### Usage

```bash
npm run clean:outputs
```