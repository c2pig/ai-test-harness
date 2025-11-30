/**
 * calibration/examples.yaml template
 */

import { ProjectConfig } from '../../generators/types';

export function generateCalibrationYaml(config: ProjectConfig): string {
  return `# Calibration Examples
#
# These examples help the LLM judge understand quality expectations.
# Add real examples from your domain to improve evaluation accuracy.

enabled: true

examples:
  - category: excellent-example
    description: Example of high-quality output
    guidance: |
      This represents an ideal response that:
      - Contains only accurate, verifiable information
      - Is well-organized with clear structure
      - Directly addresses the question asked
      - Provides complete coverage without unnecessary padding
    expectedRating:
      ZeroHallucination: 5
      CleanOutput: 5

  - category: poor-example
    description: Example of low-quality output
    guidance: |
      This represents a problematic response that:
      - May contain fabricated or inaccurate information
      - Is disorganized or hard to follow
      - Misses key aspects of the question
      - Contains irrelevant or excessive content
    expectedRating:
      ZeroHallucination: 2
      CleanOutput: 2
`;
}

