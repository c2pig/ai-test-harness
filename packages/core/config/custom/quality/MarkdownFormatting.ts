/**
 * Custom Quality Attribute: Markdown Formatting
 * AI-Test-Harness-specific attribute for candidate profile processing
 */

import { QualityAttributeDefinition } from '../../../src/quality-library/types';

export const MarkdownFormatting: QualityAttributeDefinition = {
  name: 'Markdown Formatting',
  weight: 1,
  description:
    'Ensures content within XML tag boundaries uses proper markdown syntax for readability and UI rendering. The output structure requires XML tags (per XMLFormatCompliance requirement), with markdown-formatted content inside those tags. Each section (CandidateWrittenSummary, WorkExperience, Education, Skills) should contain markdown headers (###) and bullet points (-) WITHIN the XML tags. This hybrid format ensures the content is both structurally valid (XML) and human-readable (markdown). The markdown formatting enables proper rendering in the AI-Test-Harness UI and processing by downstream markdown parsers, while XML tags provide machine-readable structure for the processing pipeline.',
  rating: {
    '5': {
      label: 'Excellent',
      description:
        'All content within XML tags uses perfect markdown formatting: ### headers for subsections, consistent bullet points (-), proper spacing. XML structure properly maintained with markdown content inside.',
    },
    '4': {
      label: 'Good',
      description:
        'Content within XML tags mostly uses proper markdown with minor issues like inconsistent bullet styles (mixing - and *), missing space after ###, or extra whitespace. Still fully renderable.',
    },
    '3': {
      label: 'Acceptable',
      description:
        '1-2 sections have content as plain text within XML tags instead of markdown. Most sections properly formatted, but some lack markdown headers or bullet points.',
    },
    '2': {
      label: 'Needs Improvement',
      description:
        'Multiple sections (2-3) contain plain text within XML tags with no markdown formatting. Significant formatting gaps that reduce readability.',
    },
    '1': {
      label: 'Not Acceptable',
      description:
        'All or nearly all content is plain text within XML tags with no markdown syntax. Profile lacks readability despite valid XML structure.',
    },
  },
  examples: {
    rating5:
      '<WorkExperience>\n### Senior Software Engineer\nTechCorp Inc. | Jan 2020 - Present\n\n- Led team of 5 engineers\n- **Reduced deployment time by 40%**\n- Implemented CI/CD pipeline\n</WorkExperience>',
    rating1:
      '<WorkExperience>\nSenior Software Engineer at TechCorp Inc from Jan 2020 to Present. Led team of 5 engineers. Reduced deployment time by 40%. Implemented CI/CD pipeline.\n</WorkExperience> (plain text, no markdown)',
  },
};
