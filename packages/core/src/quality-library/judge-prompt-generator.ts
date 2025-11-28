import { CalibrationExample } from './types';
import { generateCapabilitiesDescription, generateSchemaShape } from './schema-builder';
import { PromptLoader } from '../utils/promptLoader';
import {
  extractRatingLabels,
  generateRatingGuidelinesText,
  generateScoreToGradeMappingText,
} from './rating-labels';

function generateCalibrationExamples(examples: CalibrationExample[]): string {
  const sections: string[] = [];

  examples.forEach((example, index) => {
    const exampleNum = index + 1;
    const exampleType = example.category.toUpperCase();

    let section = `${exampleType} EXAMPLE ${exampleNum}:\n`;
    section += `${example.description}\n\n`;
    section += `Guidance:\n`;
    section += `${example.guidance}\n`;

    section += `\nExpected ratings: `;
    const ratingEntries = Object.entries(example.expectedRating).map(
      ([attr, rating]) => `${attr}: ${rating}`
    );
    section += ratingEntries.join(', ');

    sections.push(section);
  });

  return sections.join('\n\n');
}

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

interface PromptSections {
  taskPrompt: string;
  inputData: string | null;
  taskLLMOutput: string;
  expectedBehaviors: string;
}

/**
 * Build EXPECTED BEHAVIORS section (shared by both test types)
 */
function buildExpectedBehaviorsSection(context: Record<string, any>): string {
  const sections: string[] = [];

  if (context.validations) {
    sections.push(`Validations:\n${JSON.stringify(context.validations, null, 2)}`);
  }

  if (
    context.acceptanceCriteria &&
    Array.isArray(context.acceptanceCriteria) &&
    context.acceptanceCriteria.length > 0
  ) {
    const bulletedList = context.acceptanceCriteria.map((item: string) => `- ${item}`).join('\n');
    sections.push(`Acceptance Criteria:\n${bulletedList}`);
  }

  return sections.length > 0 ? sections.join('\n\n') : '';
}

/**
 * Build sections for AGENT-CONVERSATION tests
 * Structure: Instructions + Input Data + Conversation + Tools + Expected Behaviors
 */
function buildAgentConversationSections(context: Record<string, any>): PromptSections {
  // INPUT DATA: candidateDetails, jobDetails, companyDetails, etc.
  // NOTE: 'persona' is intentionally excluded - it's only for user simulator, not judge
  const inputDataParts: string[] = [];
  const inputKeys = [
    'candidateDetails',
    'jobDetails',
    'companyDetails',
    'userMessages',
    'contextData',
  ];

  inputKeys.forEach(key => {
    if (context[key] !== undefined && context[key] !== null) {
      const displayName = humanizeKey(key);
      const value =
        typeof context[key] === 'object' ? JSON.stringify(context[key], null, 2) : context[key];
      inputDataParts.push(`${displayName}:\n${value}`);
    }
  });

  // TASK LLM OUTPUT: Conversation transcript (tool calls are shown inline)
  const outputParts: string[] = [];
  if (context.conversationTranscript) {
    outputParts.push(`Conversation Transcript:\n${context.conversationTranscript}`);
  }

  return {
    taskPrompt: context.agentInstructions || '[No agent instructions provided]',
    inputData: inputDataParts.length > 0 ? inputDataParts.join('\n\n') : null,
    taskLLMOutput: outputParts.join('\n\n') || '[No output provided]',
    expectedBehaviors: buildExpectedBehaviorsSection(context),
  };
}

/**
 * Build sections for TEXT-GENERATION tests
 * Structure: Compiled Prompt (with data already injected) + Generated Output + Expected Behaviors
 * Note: No INPUT DATA section - data is already in compiled prompt
 */
function buildTextGenerationSections(context: Record<string, any>): PromptSections {
  return {
    taskPrompt: context.taskPrompt || '[No task prompt provided]',
    inputData: null, // Omit - data already in compiledPrompt
    taskLLMOutput: context.generatedOutput || '[No output provided]',
    expectedBehaviors: buildExpectedBehaviorsSection(context),
  };
}

/**
 * Assemble final prompt from sections using PromptLoader
 *
 * This function now delegates to PromptLoader.buildJudgePrompt() which loads
 * the prompt structure from YAML configuration and performs variable replacement.
 */
function assembleFinalPrompt(
  solutionDescription: string,
  sections: PromptSections,
  capabilitiesDescription: string,
  schemaShape: string,
  attributeCount: number,
  calibrationSection: string,
  ratingGuidelines: string,
  scoreToGradeMapping: string,
  templateName: string = 'llm-as-judge',
  version?: string,
  judgeModelId?: string
): string {
  // Prepare variables for YAML template
  const variables: Record<string, string> = {
    solutionDescription,
    taskPrompt: sections.taskPrompt,
    taskLLMOutput: sections.taskLLMOutput,
    capabilitiesDescription,
    schemaShape,
    attributeCount: attributeCount.toString(),
    ratingGuidelines, // Dynamic from quality attributes
    scoreToGradeMapping, // Dynamic from quality attributes
    judgeModelId: judgeModelId || 'unknown',
  };

  // Add optional sections (conditional - only if present)
  if (sections.inputData) {
    variables.inputData = sections.inputData;
  }

  if (sections.expectedBehaviors) {
    variables.expectedBehaviors = sections.expectedBehaviors;
  }

  if (calibrationSection) {
    variables.calibrationSection = calibrationSection;
  }

  // Build prompt from YAML configuration
  return PromptLoader.buildJudgePrompt(variables, templateName, version);
}

export async function generateAssessmentPrompt(
  solutionDescription: string,
  context: Record<string, any>,
  attributeNames: string[],
  calibration?: { enabled: boolean; examples: CalibrationExample[] },
  judgeModelId?: string
): Promise<string> {
  // Extract rating labels from quality attributes (single source of truth)
  const ratingLabels = await extractRatingLabels(attributeNames);

  // Generate shared components
  const capabilitiesDescription = await generateCapabilitiesDescription(attributeNames);
  const schemaShape = await generateSchemaShape(attributeNames);
  const ratingGuidelines = generateRatingGuidelinesText(ratingLabels, true);
  const scoreToGradeMapping = generateScoreToGradeMappingText(ratingLabels);

  let calibrationSection = '';
  if (calibration?.enabled && calibration.examples.length > 0) {
    calibrationSection = `
---

CALIBRATION EXAMPLES:

${generateCalibrationExamples(calibration.examples)}
`;
  }

  // Route to appropriate section builder based on test type
  const isAgentTest = !!context.conversationTranscript;
  const sections = isAgentTest
    ? buildAgentConversationSections(context)
    : buildTextGenerationSections(context);

  // Select template based on test type
  const templateName = isAgentTest ? 'llm-as-judge-agent' : 'llm-as-judge-text';

  // Assemble final prompt
  return assembleFinalPrompt(
    solutionDescription,
    sections,
    capabilitiesDescription,
    schemaShape,
    attributeNames.length,
    calibrationSection,
    ratingGuidelines,
    scoreToGradeMapping,
    templateName,
    undefined, // version
    judgeModelId
  );
}
