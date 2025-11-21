# Configuration Schema Documentation

This document describes the configuration schema for the AI-Test-Harness Testing Tools framework.

## Table of Contents

1. [Schema Versioning](#schema-versioning)
2. [Configuration File Types](#configuration-file-types)
3. [Config.yaml Structure](#configyaml-structure)
4. [Scenario.yaml Structure](#scenarioyaml-structure)
5. [Calibration.yaml Structure](#calibrationyaml-structure)
6. [Validation](#validation)
7. [Migration Guide](#migration-guide)

---

## Schema Versioning

### Current Version

**Version**: `1.0.0`

All configuration files must include a `schemaVersion` field at the top level:

```yaml
schemaVersion: "1.0.0"
```

### Supported Versions

- `1.0.0` - Initial schema version with Zod validation

### Version Format

The schema version follows [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH):

- **MAJOR**: Breaking changes that require manual migration
- **MINOR**: New features added in a backward-compatible manner
- **PATCH**: Backward-compatible bug fixes

### Why Schema Versioning?

Schema versioning enables:

1. **Change Tracking**: Know what changed between versions
2. **Backward Compatibility**: Support multiple schema versions simultaneously
3. **Graceful Migration**: Deprecated fields can be phased out over time
4. **Clear Documentation**: Version-specific schema documentation
5. **Validation**: Catch incompatible configurations early

---

## Configuration File Types

The framework uses three types of configuration files:

| File | Purpose | Schema Validation | Location |
|------|---------|-------------------|----------|
| **config.yaml** | Tenant configuration (test plan, evaluation) | ✅ Required | `tenants/*/config.yaml` |
| **scenario.yaml** | Test scenario definitions | ✅ Required | `tenants/*/scenarios/*.yaml` |
| **calibration.yaml** | Quality assessment calibration | ✅ Required | `tenants/*/evaluation/calibration.yaml` |
| **models.yaml** | Shared model definitions | ✅ Required | `config/shared/models.yaml` |
| **connectors.yaml** | Shared data source connectors | ✅ Required | `config/shared/connectors.yaml` |

---

## Config.yaml Structure

### Important Notes

- **Optional LLM Parameters**: `temperature`, `topP`, and `maxTokens` are optional in all LLM configurations (`judgeModel`, `llmConfig`, `userSimulator`). When omitted, AWS Bedrock will use the model's default values.
- **Explicit vs. Default**: While these fields are optional, explicitly setting them is recommended for reproducibility and cost control.

### Required Fields

```yaml
schemaVersion: "1.0.0"  # REQUIRED: Schema version

project:
  name: string          # REQUIRED: Project name
  description: string   # REQUIRED: Project description

testPlan:
  type: enum            # REQUIRED: Test type (see below)
  # ... type-specific fields

evaluationPlan:
  judgeModel:           # REQUIRED: Judge LLM configuration
    modelId: string     # REQUIRED
    temperature: number # OPTIONAL: 0-1
    topP: number        # OPTIONAL: 0-1
    maxTokens: number   # OPTIONAL: positive integer (uses Bedrock default if omitted)

  qualityAssessment:
    attributes: string[]    # REQUIRED: At least one attribute
    solutionDescription: string  # REQUIRED
    calibrationPath: string  # OPTIONAL: Path to calibration.yaml

validators:  # OPTIONAL
  toolCalls: string[]   # Required tool call names
  cost:
    lt: number          # Less than (USD)
    gt: number          # Greater than (USD)
  latencyMs:
    lt: number          # Less than (milliseconds)
    gt: number          # Greater than (milliseconds)
```

### Test Types

The `testPlan.type` field determines the test runner and required fields.

#### 1. Text Generation (`text-generation`)

Generate and evaluate text using LLM with a prompt.

```yaml
testPlan:
  type: text-generation

  prompt: string        # REQUIRED: Reference to shared prompt model

  llmConfig:            # REQUIRED: LLM configuration
    modelId: string     # REQUIRED
    temperature: number # OPTIONAL: 0-1
    topP: number        # OPTIONAL: 0-1
    maxTokens: number   # OPTIONAL: positive integer (uses Bedrock default if omitted)

  connectors:           # OPTIONAL: Data source connectors
    [key]: string       # Reference to shared connector
```

**Example**:

```yaml
schemaVersion: "1.0.0"

project:
  name: product-listing
  description: Quality assessment for candidate profile generation

testPlan:
  type: text-generation
  prompt: product-listing

  llmConfig:
    modelId: bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0
    temperature: 0.5
    topP: 1.0
    maxTokens: 4000

  connectors:
    logs: 60-day-logs-query

evaluationPlan:
  judgeModel:
    modelId: bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0
    temperature: 0
    topP: 1.0
    maxTokens: 4000

  qualityAssessment:
    attributes:
      - Accuracy
      - Completeness
      - Professionalism
    solutionDescription: "Generate accurate and complete candidate profiles..."
```

---

#### 2. Agent Scenario (`agent-scenario`)

Test Bedrock agent with scripted conversation scenarios.

```yaml
testPlan:
  type: agent-scenario

  agent: string         # REQUIRED: Reference to shared Bedrock agent
  scenariosPath: string # REQUIRED: Glob pattern to scenario files

  connectors:           # OPTIONAL: Context data connectors
    [key]: string
```

**Example**:

```yaml
schemaVersion: "1.0.0"

project:
  name: product-outreach
  description: Quality assessment for candidate screening agent

testPlan:
  type: agent-scenario
  agent: agentOutreach
  scenariosPath: "./scenarios/**/*.yaml"

evaluationPlan:
  judgeModel:
    modelId: bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0
    temperature: 0
    topP: 1.0
    maxTokens: 4000

  qualityAssessment:
    attributes:
      - QuestioningStrategy
      - EvidenceGathering
      - RequirementAlignment
    solutionDescription: "Screen candidates effectively..."
    calibrationPath: "./evaluation/calibration.yaml"

validators:
  toolCalls:
    - getCandidateDetails
    - updateCandidateStatus
```

---

#### 3. Agent Simulation (`agent-simulation`)

Test Bedrock agent with dynamic conversations powered by an LLM user simulator.

```yaml
testPlan:
  type: agent-simulation

  agent: string         # REQUIRED: Reference to shared Bedrock agent
  scenariosPath: string # REQUIRED: Glob pattern to scenario files

  userSimulator:        # REQUIRED: LLM user simulator configuration
    modelId: string     # REQUIRED
    temperature: number # OPTIONAL: 0-1
    topP: number        # OPTIONAL: 0-1
    maxTokens: number   # OPTIONAL: positive integer (uses Bedrock default if omitted)

  conversationControl:  # REQUIRED: Conversation control settings
    maxTurns: number    # Maximum conversation turns

  connectors:           # OPTIONAL: Context data connectors
    [key]: string
```

**Example**:

```yaml
schemaVersion: "1.0.0"

project:
  name: product-outreach-dynamic
  description: Dynamic conversation testing for screening agent

testPlan:
  type: agent-simulation
  agent: agentOutreach
  scenariosPath: "./scenarios/**/*.yaml"

  userSimulator:
    modelId: bedrock:anthropic.claude-3-5-sonnet-20240620-v1:0
    temperature: 0.7
    topP: 0.9
    maxTokens: 500

  conversationControl:
    maxTurns: 15

evaluationPlan:
  # ... (same structure as agent-scenario)
```

---

#### 4. Agent Rerun (`agent-rerun`)

Re-invoke Bedrock agent with historical user messages from a data source.

```yaml
testPlan:
  type: agent-rerun

  agent: string         # REQUIRED: Reference to shared Bedrock agent

  expectedToolCalls:    # REQUIRED: At least one expected tool call
    - name: string
      triggerCondition: string

  connectors:           # REQUIRED: At least one connector for conversation data
    [key]: string
```

**Example**:

```yaml
schemaVersion: "1.0.0"

project:
  name: product-outreach-reinvoke
  description: Backtest optimized prompts with historical data

testPlan:
  type: agent-rerun
  agent: agentOutreach

  connectors:
    conversations: dynamodb-conversations

  expectedToolCalls:
    - name: getCandidateDetails
      triggerCondition: "beginning of conversation"
    - name: updateCandidateStatus
      triggerCondition: "after gathering evidence"

evaluationPlan:
  # ... (same structure as agent-scenario)
```

---

#### 5. Conversation Evaluation (`conversation-evaluation`)

Evaluate historical production conversations from a data source.

```yaml
testPlan:
  type: conversation-evaluation

  agent: string         # REQUIRED: Reference to shared Bedrock agent (for metadata)

  expectedToolCalls:    # REQUIRED: At least one expected tool call
    - name: string
      triggerCondition: string

  connectors:           # REQUIRED: At least one connector for conversation data
    [key]: string
```

**Example**:

```yaml
schemaVersion: "1.0.0"

project:
  name: product-outreach-replay
  description: Quality assessment for production conversations

testPlan:
  type: conversation-evaluation
  agent: agentOutreach

  connectors:
    conversations: dynamodb-conversations

  expectedToolCalls:
    - name: getCandidateDetails
      triggerCondition: "beginning of conversation"
    - name: updateCandidateStatus
      triggerCondition: "after gathering evidence"

evaluationPlan:
  # ... (same structure as agent-scenario)
```

---

## Scenario.yaml Structure

Scenario files define test cases for agent-based testing.

### Agent Scenario (Scripted)

For `testPlan.type: agent-scenario`

```yaml
scenarioId: string          # REQUIRED: Unique scenario identifier
description: string         # REQUIRED: Scenario description

conversationExamples:       # REQUIRED: At least one message
  - user: string            # User message

validations:                # REQUIRED: Expected outcomes
  escalation: boolean       # Should escalation occur?
  escalationType: string    # OPTIONAL: Type of escalation

acceptanceCriteria:         # REQUIRED: At least one criterion
  - string

contextData:                # OPTIONAL: Agent context data
  [key]: any
```

**Example**:

```yaml
scenarioId: qualified-candidate-strong-evidence
description: Test agent's ability to identify qualified candidates with strong evidence

conversationExamples:
  - user: "Hi, I'm interested in the Senior Software Engineer role."
  - user: "I have 8 years of experience in Python and Django."
  - user: "Yes, I've led teams of 5-10 developers."

validations:
  escalation: false

acceptanceCriteria:
  - Agent should gather evidence for all requirements
  - Agent should confirm qualification based on evidence
  - No unnecessary questions should be asked

contextData:
  candidateDetails:
    fullName: "John Doe"
    recommendationId: 12345
  jobDetails:
    title: "Senior Software Engineer"
    requirements:
      - "5+ years Python experience"
      - "Team leadership experience"
```

---

### Agent Simulation (Dynamic)

For `testPlan.type: agent-simulation`

```yaml
scenarioId: string          # REQUIRED: Unique scenario identifier
description: string         # REQUIRED: Scenario description

persona:                    # REQUIRED: At least one persona trait
  - string

candidateDetails:           # OPTIONAL: Factual background for user simulator
  fullName: string
  email: string (email format)
  recommendationId: number (positive integer)
  appliedRole: string
  experience:               # OPTIONAL
    - company: string
      role: string
      duration: string
  skills: string[]          # OPTIONAL
  education: string         # OPTIONAL
  location: string          # OPTIONAL

contextData:                # OPTIONAL: Agent context data
  candidateDetails: object
  jobDetails: object
  companyDetails: object

acceptanceCriteria:         # OPTIONAL
  - string

validations:                # OPTIONAL
  escalation: boolean
  escalationType: string
```

**Example**:

```yaml
scenarioId: interested-candidate
description: Candidate who is interested and qualified

persona:
  - "Enthusiastic and cooperative"
  - "Has relevant experience"
  - "Answers questions clearly and completely"

candidateDetails:
  fullName: "Jane Smith"
  email: "jane.smith@example.com"
  recommendationId: 54321
  appliedRole: "Senior Software Engineer"
  experience:
    - company: "Tech Corp"
      role: "Software Engineer"
      duration: "5 years"
  skills:
    - "Python"
    - "Django"
    - "Team Leadership"

contextData:
  candidateDetails:
    fullName: "Jane Smith"
    recommendationId: 54321
  jobDetails:
    title: "Senior Software Engineer"
    requirements:
      - "5+ years Python experience"
      - "Team leadership experience"

acceptanceCriteria:
  - "Agent successfully gathers all required information"
  - "Conversation flows naturally"
  - "Candidate qualification is correctly determined"
```

---

## Calibration.yaml Structure

Calibration files provide reference examples for quality assessment.

```yaml
enabled: boolean            # REQUIRED: Whether calibration is enabled

examples:                   # REQUIRED when enabled: At least one example
  - category: string        # Example category
    description: string     # Detailed description
    characteristics:        # REQUIRED: At least one characteristic
      - string
    expectedRating:         # REQUIRED: At least one attribute rating
      [attributeName]: number  # 1-5 rating scale
```

**Notes**:
- `expectedRating` should only include ratings for applicable attributes
- Non-applicable attributes should be omitted
- Ratings must be integers between 1 and 5

**Example**:

```yaml
enabled: true

examples:
  - category: immediate-escalation-safety
    description: "Candidate uses abusive or inappropriate language that warrants immediate escalation"
    characteristics:
      - "Abusive language"
      - "Safety concern"
      - "Immediate escalation needed"
    expectedRating:
      QuestioningStrategy: 5  # N/A - no questioning occurred
      EvidenceGathering: 5    # N/A - no evidence gathering needed
      RequirementAlignment: 5 # N/A - escalated before assessment
      CandidateExperience: 1  # Poor - abusive behavior
      EscalationHandling: 5   # Excellent - immediate escalation

  - category: qualification-strong-evidence
    description: "Candidate with clear qualification supported by strong evidence"
    characteristics:
      - "All requirements met"
      - "Strong supporting evidence"
      - "Efficient conversation"
    expectedRating:
      QuestioningStrategy: 5      # Excellent - targeted questions
      EvidenceGathering: 5        # Excellent - comprehensive evidence
      RequirementAlignment: 5     # Excellent - accurate assessment
      CandidateExperience: 5      # Excellent - smooth interaction
      EscalationHandling: 5       # Excellent - appropriate handling
```

---

## Validation

### Validation Tools

1. **CLI Validation**: `npm run validate`
   - Validates all configuration files before test execution
   - Checks schema compliance, cross-references, and data contracts

2. **Runtime Validation**: Automatic
   - ConfigLoader validates all configs during load time
   - Fails fast with clear error messages

### Validation Levels

| Level | What's Validated | When | Tool |
|-------|-----------------|------|------|
| **Schema** | Structure, types, required fields, value ranges | Pre-execution & Runtime | Zod schemas |
| **Cross-references** | Model and connector references exist | Pre-execution | validate-configs.ts |
| **Data contracts** | Connector outputSchema matches consumer inputKeys | Runtime | ContractValidator |
| **Test results** | Cost, latency, tool calls | Post-execution | ValidationRunner |

### Common Validation Errors

#### Missing schemaVersion

```
Error: [schemaVersion]: Missing required 'schemaVersion' field
Suggestion: Add 'schemaVersion: "1.0.0"' at the top of your config file
```

**Fix**: Add schema version field at the top of your config:

```yaml
schemaVersion: "1.0.0"
```

---

#### Invalid schemaVersion Format

```
Error: [schemaVersion]: 'schemaVersion' must follow semantic versioning format (X.Y.Z), got "1.0"
Suggestion: Use format like "1.0.0"
```

**Fix**: Use proper semantic versioning:

```yaml
schemaVersion: "1.0.0"  # Not "1.0" or "v1.0.0"
```

---

#### Unsupported schemaVersion

```
Error: [schemaVersion]: Unsupported schema version "2.0.0". Supported versions: 1.0.0
Suggestion: Update to current version "1.0.0" or see migration guide at docs/config-schema.md
```

**Fix**: Update to a supported version or upgrade the framework.

---

#### Missing Required Field

```
Error: [testPlan.agent]: agent reference is required
```

**Fix**: Add the required field:

```yaml
testPlan:
  type: agent-scenario
  agent: agentOutreach  # Add this
```

---

#### Invalid Type

```
Error: [evaluationPlan.judgeModel.temperature]: Expected number, received string
```

**Fix**: Correct the type:

```yaml
evaluationPlan:
  judgeModel:
    temperature: 0.5  # Not "0.5" (string)
```

---

#### Out of Range Value

```
Error: [evaluationPlan.judgeModel.temperature]: Number must be less than or equal to 1
```

**Fix**: Use a valid range:

```yaml
evaluationPlan:
  judgeModel:
    temperature: 0.5  # Must be 0-1
```

---

#### Unknown Reference

```
Error: product-outreach: references unknown agent 'agentFoo'
```

**Fix**: Ensure the reference exists in `config/shared/models.yaml`:

```yaml
testPlan:
  agent: agentOutreach  # Must exist in models.yaml
```

---

## Migration Guide

### From Unversioned to 1.0.0

If you have existing config files without `schemaVersion`:

1. **Add schemaVersion field** at the top of each `config.yaml`:

   ```yaml
   schemaVersion: "1.0.0"

   project:
     # ... rest of config
   ```

2. **Run validation** to check for other issues:

   ```bash
   npm run validate
   ```

3. **Fix any validation errors** reported by the validator

4. **Test your configuration** by running a test:

   ```bash
   npm run test:tenant -- tenants/your-tenant
   ```

### Future Migrations

When new schema versions are released, migration guides will be provided here.

---

## Additional Resources

- [Zod Documentation](https://zod.dev/) - Schema validation library
- [Semantic Versioning](https://semver.org/) - Version numbering specification
- [JSON Schema](https://json-schema.org/) - Alternative schema specification

---

## Schema Version History

### 1.0.0 (2025-11-11)

**Initial schema version with comprehensive Zod validation**

- Added `schemaVersion` field requirement
- Implemented Zod schemas for all config types:
  - `config.yaml` - Tenant configuration with discriminated unions
  - `scenario.yaml` - Test scenario definitions
  - `calibration.yaml` - Quality assessment calibration
  - `models.yaml` - Shared model definitions
  - `connectors.yaml` - Shared connector definitions
- Added runtime validation in ConfigLoader
- Enhanced CLI validation with detailed error messages
- Created comprehensive schema documentation

**Breaking Changes**: None (initial version)

**Deprecations**: None

---

For questions or issues, see the [GitHub Issues](https://github.com/your-org/ai-test-harness-testing-tools/issues) page.
