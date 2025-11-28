/**
 * Core Quality Attributes - Universal across all AI solutions
 */

import { QualityAttributeDefinition } from '../types';

export const ZeroHallucination: QualityAttributeDefinition = {
  name: 'Zero Hallucination',
  weight: 1.0,
  description:
    "Judge as a fact-checker would: Can every single piece of information in the output be traced back to the source inputs? A hallucination is anything that wasn't in the inputs - invented skills, fabricated titles, assumed dates, inferred experiences. Even 'reasonable' additions are unacceptable. Ask yourself: 'If I had to defend this in court, could I point to exactly where each fact came from?' Any information you cannot source is a hallucination, regardless of how plausible it seems.",
  rating: {
    '5': {
      label: 'Excellent',
      description:
        'Every fact is directly traceable. You could cite the exact source for each piece of information. Zero assumptions or inferences made.',
    },
    '4': {
      label: 'Good',
      description:
        '1-2 very minor issues like date formatting or abbreviation expansion that a reasonable person would not consider substantive fabrication.',
    },
    '3': {
      label: 'Acceptable',
      description:
        '3-5 additions that cannot be sourced. A fact-checker would flag these as needing verification. Core information is accurate but some claims are unsupported.',
    },
    '2': {
      label: 'Needs Improvement',
      description:
        '6-10 unsourced claims. A fact-checker would return this for major revisions. Too many statements cannot be verified against inputs.',
    },
    '1': {
      label: 'Not Acceptable',
      description:
        'Substantial fabrication. Critical facts like companies, degrees, or job titles are invented. A fact-checker would reject this entirely.',
    },
  },
  examples: {
    rating5: "Candidate has 'Python, Java' in input → Output shows 'Python, Java'",
    rating1:
      "Candidate has 'Python, Java' in input → Output shows 'Python, Java, Machine Learning, AWS' (last two are hallucinations)",
  },
};

export const CleanOutput: QualityAttributeDefinition = {
  name: 'Clean Output',
  weight: 1.0,
  description:
    "Judge as a busy professional receiving this output: Can I use it immediately, or do I need to edit it first? Evaluate the ENTIRE response - everything the LLM produced. If there's ANY text before or after the requested content (explanations, reasoning, analysis, thinking), you need to extract what you want. That's not production-ready. The test is simple: could you copy-paste the complete output directly to an end user? If you'd need to delete anything first, deduct points proportionally to how much cleanup is required.",
  rating: {
    '5': {
      label: 'Excellent',
      description:
        'Completely production-ready. You can use the entire output immediately without any editing. Nothing to delete, nothing to extract.',
    },
    '4': {
      label: 'Good',
      description:
        'Nearly ready. One brief sentence or minor text to remove. Less than 10 seconds of cleanup needed.',
    },
    '3': {
      label: 'Acceptable',
      description:
        'Usable but needs editing. A paragraph or section to remove. You need to extract the actual content from surrounding text.',
    },
    '2': {
      label: 'Needs Improvement',
      description:
        'Significant editing required. Multiple sections of unwanted text. The actual content is buried in explanations or analysis.',
    },
    '1': {
      label: 'Not Acceptable',
      description:
        'Extensive cleanup needed. The response is mostly meta-text with the actual content as a small portion. Requires substantial extraction work.',
    },
  },
  examples: {
    rating5: '<Summary>\\n* Software Engineer with 5 years experience in Python...\\n</Summary>',
    rating1:
      'Let me analyze this CV for you. First, I will examine the experience section... <Summary>* Software Engineer...</Summary> This summary highlights the key qualifications.',
  },
};

export const InstructionCompliance: QualityAttributeDefinition = {
  name: 'Instruction Compliance',
  weight: 1.0,
  description:
    "Judge as the person who wrote the prompt: Did the LLM actually do what I asked? Step back and look at the whole picture - not format or structure, but intent and purpose. Did it understand WHY I wanted this output? Did it serve my actual goal? A response can be perfectly formatted yet completely miss the point. Ask: 'If I handed this to my colleague, would they say the LLM understood the assignment?' This catches smart-sounding outputs that fundamentally fail to deliver what was needed.",
  rating: {
    '5': {
      label: 'Excellent',
      description:
        'Nailed it. The LLM clearly understood the purpose and delivered exactly what was needed. You would be satisfied handing this to stakeholders.',
    },
    '4': {
      label: 'Good',
      description:
        'Strong understanding with minor misses. Serves the purpose well but 1-2 aspects could be better aligned with your actual goal.',
    },
    '3': {
      label: 'Acceptable',
      description:
        'Partial understanding. Gets some things right but missed or misinterpreted key aspects. You would need to request revisions.',
    },
    '2': {
      label: 'Needs Improvement',
      description:
        'Surface-level compliance only. Technically followed instructions but missed the deeper purpose. Would not serve your actual use case.',
    },
    '1': {
      label: 'Not Acceptable',
      description:
        'Missed the point entirely. The output may look well-formed but does not serve the intended purpose at all. You would need to start over.',
    },
  },
  examples: {
    rating5:
      'Task: Summarize CV for recruiter screening → Output provides concise, relevant highlights that enable quick hiring decisions',
    rating1:
      'Task: Summarize CV for recruiter screening → Output provides verbose academic analysis that is unusable for quick screening',
  },
};
