/**
 * Quality Attribute: Qualification Matching
 * For Job Requirement Matching Task
 */

import { QualityAttributeDefinition } from '../../../src/quality-library/types';

export const QualificationMatching: QualityAttributeDefinition = {
  name: 'Qualification Matching',
  weight: 0.9,
  description:
    "Accurate assessment of educational and certification requirements. Must correctly: (1) match degree levels (Bachelor's, Master's, etc.), (2) recognize equivalent qualifications across jurisdictions (e.g., CPA vs CAANZ), (3) distinguish between completed vs. in-progress qualifications, (4) identify field of study relevance (accounting degree for accounting role). Errors create legal compliance risks and filtering mistakes.",
  rating: {
    '5': {
      label: 'Excellent',
      description:
        'Perfect matching. Correctly identifies degree levels, recognizes equivalent credentials, applies field-of-study relevance appropriately.',
    },
    '4': {
      label: 'Good',
      description:
        '1 minor oversight like treating Honours degree same as regular Bachelor (technically different but functionally equivalent for most roles).',
    },
    '3': {
      label: 'Acceptable',
      description:
        '2 matching errors, such as marking unrelated field as qualified, or failing to recognize standard equivalent credentials.',
    },
    '2': {
      label: 'Needs Improvement',
      description:
        '3-4 matching errors. Systematically misidentifies degree levels or fails to recognize field relevance.',
    },
    '1': {
      label: 'Not Acceptable',
      description:
        'Critical errors like marking high school diploma as meeting Bachelor requirement, or marking unrelated degree (e.g., Arts) as meeting technical requirement (e.g., Engineering).',
    },
  },
  examples: {
    rating5:
      "Requirement: 'Bachelor in Accounting' + Candidate: 'Bachelor of Business (Accounting Major), RMIT' → Correctly marked FULFILLED",
    rating1:
      "Requirement: 'Bachelor in Accounting' + Candidate: 'Bachelor of Arts' → Incorrectly marked FULFILLED",
  },
};
