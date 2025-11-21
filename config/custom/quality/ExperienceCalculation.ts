/**
 * Quality Attribute: Experience Calculation
 * For Job Requirement Matching Task
 */

import { QualityAttributeDefinition } from '../../../src/quality-library/types';

export const ExperienceCalculation: QualityAttributeDefinition = {
  name: 'Experience Calculation',
  weight: 1.0,
  description:
    "Accurate counting of years of relevant experience. Must correctly: (1) identify which roles count as relevant, (2) calculate duration from dates, (3) exclude career breaks, (4) apply domain-specificity rules (e.g., '5-star hotel experience' means only luxury hotel brands count), (5) consider only most recent 10 years for requirements <10 years. Miscounting leads to incorrect candidate filtering.",
  rating: {
    '5': {
      label: 'Excellent',
      description:
        'Perfect calculation. Correctly identifies relevant roles, accurately sums duration, properly excludes gaps, applies specificity rules correctly.',
    },
    '4': {
      label: 'Good',
      description:
        '±3 months calculation error, or includes one marginally relevant role where reasonable evaluators might disagree on relevance.',
    },
    '3': {
      label: 'Acceptable',
      description:
        '±6 months error, or includes 1-2 loosely relevant roles that stretch the requirement definition.',
    },
    '2': {
      label: 'Needs Improvement',
      description:
        '±12 months error, counts career breaks as experience, or systematically includes non-relevant roles (e.g., counting retail jobs for software engineer requirement).',
    },
    '1': {
      label: 'Not Acceptable',
      description:
        '±2+ years error, fundamentally miscounts experience, or includes completely irrelevant roles.',
    },
  },
  examples: {
    rating5:
      "Requirement: '3 years insolvency accounting' + Candidate: 6 years fund accounting, 0 insolvency → Correctly counts 0 years relevant experience",
    rating1:
      "Requirement: '3 years insolvency accounting' + Candidate: 6 years fund accounting, 0 insolvency → Incorrectly counts 6 years",
  },
};
