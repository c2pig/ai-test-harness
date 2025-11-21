/**
 * Quality Attribute: Requirement Accuracy
 * For Job Requirement Matching Task
 */

import { QualityAttributeDefinition } from '../../../src/quality-library/types';

export const RequirementAccuracy: QualityAttributeDefinition = {
  name: 'Requirement Accuracy',
  weight: 1.0,
  description:
    "Correctness of FULFILLED/UNFULFILLED/UNKNOWN decisions for each requirement. The LLM must accurately determine if candidate evidence satisfies each requirement. Incorrect assessments lead to wrong hiring decisions - marking qualified candidates as unqualified (false negatives) or vice versa (false positives). Both errors have real business costs.",
  rating: {
    '5': {
      label: 'Excellent',
      description:
        'All requirement assessments are correct. Every FULFILLED has clear supporting evidence, every UNFULFILLED has valid justification, UNKNOWN only used when genuinely ambiguous.',
    },
    '4': {
      label: 'Good',
      description:
        '1 incorrect assessment out of 5+ requirements, or 1-2 defensible edge cases where reasonable evaluators might disagree.',
    },
    '3': {
      label: 'Acceptable',
      description:
        '2 incorrect assessments, or several overly conservative/liberal judgments that systematically bias results.',
    },
    '2': {
      label: 'Needs Improvement',
      description:
        '3-4 incorrect assessments. Multiple false positives or false negatives. Poor application of transferable skills reasoning.',
    },
    '1': {
      label: 'Not Acceptable',
      description:
        '5+ incorrect assessments, or critical errors like marking "3 years experience" as FULFILLED when candidate has 1 year, or UNFULFILLED when candidate has 5 years.',
    },
  },
  examples: {
    rating5:
      "Requirement: '3 years insolvency experience' + Candidate has 0 years insolvency (only fund accounting) → Correctly marked UNFULFILLED",
    rating1:
      "Requirement: '3 years insolvency experience' + Candidate has 0 years insolvency → Incorrectly marked FULFILLED because 'accounting is similar'",
  },
};
