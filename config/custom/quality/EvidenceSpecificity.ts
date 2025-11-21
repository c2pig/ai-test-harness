/**
 * Quality Attribute: Evidence Specificity
 * For Job Requirement Matching Task
 */

import { QualityAttributeDefinition } from '../../../src/quality-library/types';

export const EvidenceSpecificity: QualityAttributeDefinition = {
  name: 'Evidence Specificity',
  weight: 0.7,
  description:
    "Level of detail required to mark requirement as FULFILLED. Must distinguish between: (1) explicit evidence (directly states requirement), (2) strong implicit evidence (clearly demonstrates capability through specific examples), (3) weak implicit evidence (vague or tangential), (4) no evidence. Should require explicit or strong implicit evidence for FULFILLED. Weak evidence should trigger UNKNOWN or UNFULFILLED depending on context.",
  rating: {
    '5': {
      label: 'Excellent',
      description:
        'High standards. Only marks FULFILLED when explicit evidence exists or strong implicit evidence with multiple supporting data points.',
    },
    '4': {
      label: 'Good',
      description:
        '1 instance of accepting moderately implicit evidence where stronger evidence would be preferable but assessment is defensible.',
    },
    '3': {
      label: 'Acceptable',
      description:
        '2 instances of weak evidence accepted as FULFILLED, or 1 instance of rejecting strong implicit evidence as insufficient.',
    },
    '2': {
      label: 'Needs Improvement',
      description:
        'Frequently accepts vague or tangential evidence. Marks FULFILLED based on assumptions rather than actual evidence.',
    },
    '1': {
      label: 'Not Acceptable',
      description:
        'Marks FULFILLED with no evidence, or requires impossibly explicit evidence even when strong implicit evidence exists.',
    },
  },
  examples: {
    rating5:
      "Requirement: 'Experience preparing investigative reports' + Candidate: 'Preparation of investigative reports' explicitly listed → FULFILLED (explicit evidence)",
    rating1:
      "Requirement: 'Experience preparing investigative reports' + Candidate: 'Conducted data analysis' → FULFILLED (too weak, analysis ≠ investigative reports)",
  },
};
