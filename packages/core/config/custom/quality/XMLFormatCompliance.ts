/**
 * Custom Quality Attribute: XML Format Compliance
 * AI-Test-Harness-specific attribute for candidate profile processing
 */

import { QualityAttributeDefinition } from '../../../src/quality-library/types';

export const XMLFormatCompliance: QualityAttributeDefinition = {
  name: 'XML Format Compliance',
  weight: 1,
  description:
    'Ensures the LLM output follows the required XML schema structure for downstream system processing. The generated output must be valid, parseable XML. Invalid XML breaks the processing pipeline and results in empty/missing candidate profiles in the database. All tags must be properly opened and closed, properly nested, and follow the required schema structure. This is a critical technical requirement, not optional formatting. Determines whether downstream systems can parse and process the candidate profile. Broken XML = no candidate profile data saved to database = candidate invisible to recruiters = lost business opportunity.',
  rating: {
    '5': {
      label: 'Excellent',
      description:
        'Valid, well-formed XML with perfect structure. All tags properly opened, closed, and nested. Fully parseable and compliant with the required schema.',
    },
    '4': {
      label: 'Good',
      description:
        'Valid XML but with minor formatting issues such as extra whitespace, inconsistent indentation, or non-critical formatting variations. Still fully parseable.',
    },
    '3': {
      label: 'Acceptable',
      description:
        'Invalid XML but mostly parseable and recoverable. Issues like 1-2 missing closing tags or minor nesting problems that can be auto-corrected by tolerant parsers.',
    },
    '2': {
      label: 'Needs Improvement',
      description:
        'Multiple XML structural errors including several missing or mismatched tags, improper nesting in multiple locations. Parseable only with significant error recovery.',
    },
    '1': {
      label: 'Not Acceptable',
      description:
        'Completely broken XML that is unparseable. Multiple critical structural errors, missing required tags, severe nesting violations, or malformed syntax throughout.',
    },
  },
  examples: {
    rating5:
      '<candidate_profile><name>John Doe</name><skills><skill>Python</skill></skills></candidate_profile>',
    rating1:
      '<candidate_profile><name>John Doe<skills><skill>Python</skills></candidate_profile> (missing closing tags, improper nesting)',
  },
};
