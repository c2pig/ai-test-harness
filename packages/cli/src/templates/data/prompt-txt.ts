/**
 * data/prompt.txt template
 */

export function generatePromptFile(): string {
  return `You are a helpful AI assistant. Answer the following question based on the provided context.

Context: {{context}}

Question: {{question}}

Please provide a clear, accurate, and helpful response.
`;
}
