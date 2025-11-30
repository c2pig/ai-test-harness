/**
 * Quality Attribute: Conservative Unknown Usage
 * For Job Requirement Matching Task
 */

import { QualityAttributeDefinition } from '../../../src/quality-library/types';

export const ConservativeUnknownUsage: QualityAttributeDefinition = {
  name: 'Conservative Unknown Usage',
  weight: 0.6,
  description:
    "Appropriate use of UNKNOWN status. Should only use UNKNOWN when: (1) candidate profile genuinely lacks information to assess requirement, (2) requirement is ambiguous and multiple interpretations are equally valid, (3) evidence is contradictory. Must NOT use UNKNOWN as a cop-out when clear evidence exists. Overuse of UNKNOWN reduces system utility; underuse creates false confidence.",
  rating: {
    '5': {
      label: 'Excellent',
      description:
        'Perfect judgment. UNKNOWN used only when genuinely indeterminate. Makes decisive FULFILLED/UNFULFILLED calls when evidence is clear.',
    },
    '4': {
      label: 'Good',
      description:
        '1 instance where UNKNOWN used but evidence was sufficient for a confident assessment (overly cautious).',
    },
    '3': {
      label: 'Acceptable',
      description:
        '2 instances of inappropriate UNKNOWN usage, or 1 instance where clear lack of evidence should have triggered UNKNOWN but made a guess instead.',
    },
    '2': {
      label: 'Needs Improvement',
      description:
        'Overuses UNKNOWN as default (3-4 instances where clear evidence exists), or consistently makes confident calls without sufficient evidence.',
    },
    '1': {
      label: 'Not Acceptable',
      description:
        'Marks most/all requirements as UNKNOWN despite clear evidence, or never uses UNKNOWN even when genuinely ambiguous.',
    },
  },
  examples: {
    rating5:
      "Requirement: 'Experience with ASIC reporting' + Candidate: 'Assisted with ASIC Corporate Secretarial duties' → Correctly marked FULFILLED (clear evidence)",
    rating1:
      "Requirement: 'Experience with ASIC reporting' + Candidate: 'Assisted with ASIC Corporate Secretarial duties' → Incorrectly marked UNKNOWN (evidence exists)",
  },
};
