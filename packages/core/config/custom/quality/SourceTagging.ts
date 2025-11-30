/**
 * Custom Quality Attribute: Source Tagging
 * AI-Test-Harness-specific attribute for candidate profile processing
 */

import { QualityAttributeDefinition } from '../../../src/quality-library/types';

export const SourceTagging: QualityAttributeDefinition = {
  name: 'Source Tagging',
  weight: 1,
  description:
    "Verifies that each data section correctly identifies which source document (AppliedCV, JobPlatformProfile, DefaultCV, or NotAvailable) provided that information. Every section/field in the output should be tagged with its source origin using XML-style tags like <WorkExperienceSource>AppliedCV</WorkExperienceSource>. Valid source values are: 'AppliedCV', 'SEEKProfile', 'DefaultCV', or 'NotAvailable' (if the field has no data in any source). Source tags must accurately reflect where the data came from - this is used for auditing, debugging, and understanding which sources contributed to the profile. Incorrect or missing source tags make it impossible to trace data lineage. Enables data lineage tracking and verification of source priority compliance. Accurate source tagging allows debugging, quality auditing, and understanding of data provenance for compliance purposes.",
  rating: {
    '5': {
      label: 'Excellent',
      description:
        'All sections have correct, accurate source tags. Every data field is properly tagged with its actual source origin (AppliedCV, JobPlatformProfile, DefaultCV, or NotAvailable).',
    },
    '4': {
      label: 'Good',
      description:
        '1-2 sections with incorrect or missing source tags. The vast majority of fields are properly tagged, with only minor isolated errors.',
    },
    '3': {
      label: 'Acceptable',
      description:
        'Multiple sections (3-4) with wrong or missing source tags, but the majority of sections still have correct source attribution.',
    },
    '2': {
      label: 'Needs Improvement',
      description:
        'Many sections missing source tags or have incorrect attribution. Pattern suggests incomplete or inconsistent source tagging implementation.',
    },
    '1': {
      label: 'Not Acceptable',
      description:
        'Most sections missing source tags entirely or systematically incorrect (e.g., all tagged as "Unknown" or "NotAvailable" when actual sources exist). Data lineage is not traceable.',
    },
  },
  examples: {
    rating5:
      '<WorkExperienceSource>AppliedCV</WorkExperienceSource> when work experience came from AppliedCV',
    rating1:
      '<WorkExperienceSource>Unknown</WorkExperienceSource> or missing source tags entirely, or wrong source attribution',
  },
};
