/**
 * Custom Quality Attribute: Chronological Order
 * AI-Test-Harness-specific attribute for candidate profile processing
 */

import { QualityAttributeDefinition } from '../../../src/quality-library/types';

export const ChronologicalOrder: QualityAttributeDefinition = {
  name: "Chronological Order",
  weight: 1,
  description: "Verifies that time-sequenced information (work experience, education) is presented in reverse chronological order (most recent first). Work experience and education should be ordered from most recent to oldest (descending by date). This is the standard professional resume format and critical for recruiters to quickly see the candidate's current/latest position. If dates are missing, maintain the order from the source document. Mixed ordering or oldest-first ordering makes profiles harder to scan and appears unprofessional. Tests the LLM's ability to sort and organize temporal data correctly. Incorrect ordering frustrates recruiters, makes candidates appear less professional, and reduces profile effectiveness.",
  rating: {
    '5': {
      label: 'Excellent',
      description: 'Perfect reverse chronological order across all sections. All work experience and education entries are ordered from most recent to oldest with no exceptions.'
    },
    '4': {
      label: 'Good',
      description: 'Mostly correct reverse chronological order with only 1-2 entries slightly out of sequence, but the overall pattern is clear and professional.'
    },
    '3': {
      label: 'Acceptable',
      description: 'Several entries out of chronological order (3-4 transpositions) but the majority of entries follow the correct reverse chronological pattern.'
    },
    '2': {
      label: 'Needs Improvement',
      description: 'Significant ordering issues with multiple sections showing mixed chronology. Pattern is inconsistent, making it harder for recruiters to follow the candidate\'s timeline.'
    },
    '1': {
      label: 'Not Acceptable',
      description: 'Completely wrong order, such as oldest-first chronology, randomized entries, or no discernible temporal ordering. Makes the profile confusing and unprofessional.'
    }
  },
  examples: {
    rating5: "2023 Software Engineer → 2020 Junior Developer → 2018 Intern",
    rating1: "2018 Intern → 2020 Junior Developer → 2023 Software Engineer (oldest-first, wrong)"
  }
};
