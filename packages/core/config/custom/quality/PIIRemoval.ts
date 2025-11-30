/**
 * Custom Quality Attribute: PII Removal
 * AI-Test-Harness-specific attribute for candidate profile processing
 */

import { QualityAttributeDefinition } from '../../../src/quality-library/types';

export const PIIRemoval: QualityAttributeDefinition = {
  name: "PII Removal",
  weight: 1,
  description: "Ensures all Personally Identifiable Information (PII) has been removed from the output to comply with privacy requirements. PII includes: full names (first/last), phone numbers, email addresses, home addresses, social security numbers, ID numbers, gender identifiers (Mr./Ms./Mrs.), age or date of birth, religious affiliations, ethnic background, photos/images, and any other identifying personal data. Partial PII (e.g., first name only, partial phone number) is also unacceptable. This is a legal/compliance requirement, not optional. The output should be anonymized while preserving professional qualifications. Tests the LLM's ability to filter sensitive data from raw input sources. PII leaks create severe privacy liability, violate data protection regulations (GDPR/CCPA), and expose AI-Test-Harness to legal action.",
  rating: {
    '5': {
      label: 'Excellent',
      description: 'Zero PII present, completely anonymized. All personal identifiers have been successfully removed while preserving professional qualifications.'
    },
    '4': {
      label: 'Good',
      description: 'Very minor PII that isn\'t identifiable alone (e.g., common first name without last name, generic location like "California" without address).'
    },
    '3': {
      label: 'Acceptable',
      description: 'Moderate PII present such as phone number, email address, or full name. Not critical PII but should be removed for compliance.'
    },
    '2': {
      label: 'Needs Improvement',
      description: 'Multiple PII types present (e.g., name + email + phone) or sensitive identifiers like age, gender markers, or partial addresses.'
    },
    '1': {
      label: 'Not Acceptable',
      description: 'Critical PII exposure including SSN, full home address, ID numbers, or combination of multiple identifying data points that create significant privacy risk.'
    }
  },
  examples: {
    rating5: "Input has 'John Smith, john.smith@email.com, (555) 123-4567' → Output has no name, email, or phone",
    rating1: "Input has 'John Smith, john.smith@email.com' → Output includes 'John Smith' or the email address"
  }
};
