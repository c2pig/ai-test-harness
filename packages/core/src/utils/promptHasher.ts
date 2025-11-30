import * as crypto from 'crypto';

/**
 * Calculate SHA256 hash of prompt content
 * Used to detect prompt changes for benchmark comparison
 */
export function calculatePromptHash(promptContent: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(promptContent);
  return hash.digest('hex');
}
