import { extractValue } from './jsonPathExtractor';
import { Logger } from './logger';

// Transform data from any source using JSONPath schema mapping
export function applyOutputSchema(
  data: any,
  outputSchema: Record<string, string>
): Record<string, any> {
  const result: Record<string, any> = {};

  // Extract each field according to outputSchema mapping
  for (const [outputKey, extractionPath] of Object.entries(outputSchema)) {
    const value = extractValue(data, extractionPath);
    result[outputKey] = value;
  }

  return result;
}

export function applyOutputSchemaToArray(
  items: any[],
  outputSchema: Record<string, string>,
  connectorName?: string
): any[] {
  const logPrefix = connectorName ? `[${connectorName}]` : '[SchemaTransformer]';

  Logger.debug(`${logPrefix} Applying outputSchema transformation to ${items.length} items...`);
  Logger.debug(`${logPrefix} Output fields: ${Object.keys(outputSchema).join(', ')}`);

  const transformed = items.map((item, index) => {
    const result = applyOutputSchema(item, outputSchema);

    // Log first item as sample
    if (index === 0) {
      Logger.debug(
        `${logPrefix} Sample transformation - Input keys: ${Object.keys(item).slice(0, 5).join(', ')}`
      );
      Logger.debug(
        `${logPrefix} Sample transformation - Output keys: ${Object.keys(result).join(', ')}`
      );

      // Log which output fields are empty strings
      const emptyFields = Object.entries(result).filter(([_, value]) => value === '');
      if (emptyFields.length > 0) {
        Logger.debug(
          `${logPrefix} Fields with empty string values: ${emptyFields.map(([key]) => key).join(', ')}`
        );
      }
    }

    return result;
  });

  Logger.info(`${logPrefix} ✓ Successfully transformed ${transformed.length} items`);

  return transformed;
}
