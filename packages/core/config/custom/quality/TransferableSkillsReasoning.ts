/**
 * Quality Attribute: Transferable Skills Reasoning
 * For Job Requirement Matching Task
 */

import { QualityAttributeDefinition } from '../../../src/quality-library/types';

export const TransferableSkillsReasoning: QualityAttributeDefinition = {
  name: 'Transferable Skills Reasoning',
  weight: 0.8,
  description:
    "Quality of logic when assessing cross-industry or cross-functional skill transfer. Must distinguish between: (1) genuinely transferable skills (e.g., financial reconciliation across industries), (2) surface-level similarity without substance (e.g., 'both use Excel'), (3) domain-specific skills that don't transfer (e.g., insolvency law knowledge). Over-generous transfer creates false positives; over-conservative approach creates false negatives.",
  rating: {
    '5': {
      label: 'Excellent',
      description:
        'Sophisticated reasoning. Correctly identifies transferable vs. non-transferable skills, considers depth of experience, recognizes domain specificity.',
    },
    '4': {
      label: 'Good',
      description:
        '1 debatable transfer judgment where context is genuinely ambiguous and reasonable evaluators might disagree.',
    },
    '3': {
      label: 'Acceptable',
      description:
        '2 questionable transfers - either too generous (marking unrelated experience as relevant) or too conservative (rejecting clearly transferable skills).',
    },
    '2': {
      label: 'Needs Improvement',
      description:
        'Multiple weak transfer justifications. Frequently equates surface similarities with genuine skill transfer, or rigidly rejects reasonable transfers.',
    },
    '1': {
      label: 'Not Acceptable',
      description:
        'Fundamentally flawed transfer logic. Marks completely unrelated experience as transferable, or provides no reasoning for transfer claims.',
    },
  },
  examples: {
    rating5:
      "Fund accountant has APRA reporting + reconciliation → Can transfer to general corporate accounting FULFILLED, but NOT to insolvency accounting UNFULFILLED (domain-specific legal/liquidation knowledge required)",
    rating1:
      "Fund accountant → Can do insolvency accounting because 'both are accounting' (ignores specialization depth)",
  },
};
