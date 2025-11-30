import { Logger } from './logger';

export class ContractValidator {
  // Validate connector output matches prompt inputs (throws if missing keys)
  static validateDataContract(
    connectorOutputSchema: Record<string, string> | undefined,
    promptInputKeys: string[] | undefined,
    connectorName: string,
    promptName: string
  ): void {
    // Skip validation if contracts not declared (backward compatibility)
    if (!connectorOutputSchema && !promptInputKeys) {
      Logger.debug(`[ContractValidator] No contracts declared - skipping validation`);
      return;
    }

    // Warn if only one side of the contract is declared
    if (!connectorOutputSchema && promptInputKeys) {
      Logger.warn(
        `[ContractValidator] Prompt '${promptName}' declares inputKeys but ` +
          `connector '${connectorName}' has no outputSchema. ` +
          `Consider adding outputSchema to connector config for validation.`
      );
      return;
    }

    if (connectorOutputSchema && !promptInputKeys) {
      Logger.warn(
        `[ContractValidator] Connector '${connectorName}' declares outputSchema but ` +
          `prompt '${promptName}' has no inputKeys. ` +
          `Consider adding inputKeys to prompt config for validation.`
      );
      return;
    }

    // Both contracts declared - perform validation
    const providedKeys = Object.keys(connectorOutputSchema!);
    const requiredKeys = promptInputKeys!;

    const missingKeys = requiredKeys.filter(key => !providedKeys.includes(key));

    if (missingKeys.length > 0) {
      const errorMessage =
        `\n${'='.repeat(80)}\n` +
        `CONTRACT VIOLATION DETECTED\n` +
        `${'='.repeat(80)}\n\n` +
        `Connector: ${connectorName}\n` +
        `  Provides: [${providedKeys.join(', ')}]\n\n` +
        `Prompt: ${promptName}\n` +
        `  Requires: [${requiredKeys.join(', ')}]\n\n` +
        `Missing fields: [${missingKeys.join(', ')}]\n\n` +
        `Fix: Add the missing fields to 'outputSchema' in config/shared/connectors.yaml\n` +
        `Example:\n` +
        `  ${connectorName}:\n` +
        `    outputSchema:\n` +
        missingKeys.map(key => `      ${key}: "inputs.${key}"`).join('\n') +
        '\n' +
        `${'='.repeat(80)}\n`;

      throw new Error(errorMessage);
    }

    Logger.debug(
      `[ContractValidator] ✓ Contract validation passed - ` +
        `Connector '${connectorName}' provides all ${requiredKeys.length} required fields`
    );
  }
}
