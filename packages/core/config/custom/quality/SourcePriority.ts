/**
 * Custom Quality Attribute: Source Priority
 * AI-Test-Harness-specific attribute for candidate profile processing
 */

import { QualityAttributeDefinition } from '../../../src/quality-library/types';

export const SourcePriority: QualityAttributeDefinition = {
  name: 'Source Priority',
  weight: 1,
  description:
    "Evaluates whether the output correctly follows the source priority hierarchy: AppliedCV > JobPlatformProfile > DefaultCV. When a field exists in AppliedCV (the candidate's customized resume for this job), it MUST be used even if JobPlatformProfile or DefaultCV contain different data for that field. Only use lower-priority sources for fields that are missing or empty in higher-priority sources. This ensures we present the candidate's most job-specific, curated information. Ensures the LLM correctly implements the source selection logic specified in the task prompt. Presents the most accurate, job-relevant candidate information; using wrong sources can misrepresent the candidate's qualifications.",
  rating: {
    '5': {
      label: 'Excellent',
      description:
        'Perfect priority compliance across all fields. Every data point correctly follows the AppliedCV > JobPlatformProfile > DefaultCV hierarchy with no violations.',
    },
    '4': {
      label: 'Good',
      description:
        '1-2 minor violations where a single field was sourced from a lower priority source despite being available in a higher priority source. Overall compliance is strong.',
    },
    '3': {
      label: 'Acceptable',
      description:
        'Multiple fields (3-4) sourced from wrong priority level, but the majority of fields still follow the correct priority hierarchy.',
    },
    '2': {
      label: 'Needs Improvement',
      description:
        'Frequent priority violations throughout the profile. Many fields use lower-priority sources when higher-priority data is available. Pattern suggests inconsistent priority logic.',
    },
    '1': {
      label: 'Not Acceptable',
      description:
        'Systematic violations with the majority of fields ignoring priority rules. Sources appear to be selected randomly or in reverse priority, fundamentally misrepresenting candidate information.',
    },
  },
  examples: {
    rating5:
      'All work experience from AppliedCV, even though JobPlatformProfile has similar (but slightly different) job titles',
    rating1:
      'Mixed skills from all three sources randomly without following priority, or used DefaultCV skills when AppliedCV had skills listed',
  },
};
