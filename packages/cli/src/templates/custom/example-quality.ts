/**
 * custom/qualities/ResponseClarity.ts template
 */

export function generateExampleQuality(): string {
  return `/**
 * Custom Quality Attribute: Response Clarity
 *
 * Measures how clear, well-structured, and easy to understand the response is.
 * This is a general-purpose attribute applicable to any conversational AI output.
 *
 * To create your own custom attributes:
 * - Copy this file and rename it (e.g., MyCustomAttribute.ts)
 * - Update the export name to match the filename
 * - Customize the name, description, rating rubric, and examples
 * - Add it to your config.yaml: custom/qualities/MyCustomAttribute
 */

export const ResponseClarity = {
  name: 'Response Clarity',
  description: 'Evaluates how clear, well-organized, and easy to understand the response is. A clear response uses simple language, logical structure, and directly addresses the user\\'s question without unnecessary jargon or ambiguity. This measures the communication quality independent of factual accuracy.',
  weight: 1.0,

  // Rating rubric (1-5 scale) - REQUIRED
  rating: {
    '5': {
      label: 'Excellent',
      description: 'Exceptionally clear and well-structured. Uses precise language, logical flow, and appropriate formatting. The response is immediately understandable with no ambiguity. Key points are clearly highlighted and easy to follow.'
    },
    '4': {
      label: 'Good',
      description: 'Clear and well-organized with minor areas that could be improved. The main message is easily understood, though some sentences may be slightly wordy or could be better structured.'
    },
    '3': {
      label: 'Acceptable',
      description: 'Reasonably clear but with noticeable issues. Some parts may be confusing, overly complex, or poorly organized. The user can understand the response but may need to re-read sections.'
    },
    '2': {
      label: 'Needs Improvement',
      description: 'Unclear or poorly structured. Contains confusing language, disorganized information, or excessive jargon. The user struggles to extract the main points or understand the response.'
    },
    '1': {
      label: 'Not Acceptable',
      description: 'Very unclear or incoherent. The response is confusing, contradictory, or so poorly structured that the user cannot understand the intended message. May contain rambling or irrelevant content.'
    }
  },

  // Examples help calibrate the judge - highly recommended
  examples: {
    rating5: 'User asks "How do I reset my password?" Response: "To reset your password: 1) Click \\'Forgot Password\\' on the login page, 2) Enter your email address, 3) Check your inbox for a reset link, 4) Click the link and create a new password. The link expires in 24 hours."',
    rating1: 'User asks "How do I reset my password?" Response: "Well, passwords are important for security and there are many ways to handle authentication in modern systems. You might want to consider the login page where various options exist for account management purposes and such related functionality."'
  }
};

export default ResponseClarity;
`;
}

