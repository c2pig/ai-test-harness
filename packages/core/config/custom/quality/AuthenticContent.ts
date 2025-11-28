/**
 * Custom Quality Attribute: Authentic Content
 * AI-Test-Harness-specific attribute for candidate profile processing
 */

import { QualityAttributeDefinition } from '../../../src/quality-library/types';

export const AuthenticContent: QualityAttributeDefinition = {
  name: "Authentic Content",
  weight: 1,
  description: "Verifies that the output preserves the candidate's original wording, phrasing, and sentence structures exactly as written in the source documents (verbatim). The LLM must preserve the candidate's authentic voice and original text. Do NOT paraphrase, rephrase, 'improve', or embellish the candidate's self-descriptions. For example, if the candidate wrote 'I developed a web app using React', the output should say exactly that - not 'Developed enterprise-grade React applications' or 'Skilled in React-based web development'. Changing wording misrepresents the candidate's communication style and can distort their actual experience level. When content needs to be shortened, prefer truncation over paraphrasing. Tests whether the LLM can extract and preserve text without applying transformations or 'improvements'. Embellished or paraphrased content misrepresents the candidate, creates false expectations, and can lead to interview/hire mismatches.",
  rating: {
    '5': {
      label: 'Excellent',
      description: 'Perfect verbatim preservation. The candidate\'s exact words, phrasing, and sentence structures are used throughout with no paraphrasing or embellishment.'
    },
    '4': {
      label: 'Good',
      description: 'Mostly verbatim with only 1-2 sections containing slight paraphrasing, but the candidate\'s voice and meaning are preserved.'
    },
    '3': {
      label: 'Acceptable',
      description: 'Noticeable paraphrasing in multiple sections, but core meaning and most of the candidate\'s original wording are preserved. Minor embellishment present.'
    },
    '2': {
      label: 'Needs Improvement',
      description: 'Significant paraphrasing throughout with some \'corporate speak\' substitutions. The candidate\'s authentic voice is partially lost, though the facts remain accurate.'
    },
    '1': {
      label: 'Not Acceptable',
      description: 'Extensive paraphrasing and heavy embellishment that fundamentally changes the candidate\'s voice. Original wording is replaced with inflated or professional-sounding language that misrepresents the candidate.'
    }
  },
  examples: {
    rating5: "Candidate wrote 'I like coding in Python' → Output says 'I like coding in Python'",
    rating1: "Candidate wrote 'I like coding in Python' → Output says 'Highly proficient Python developer with strong passion for programming' (embellished)"
  }
};
