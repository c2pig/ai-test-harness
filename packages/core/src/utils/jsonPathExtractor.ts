import { Logger } from './logger';

// Extract value from nested object using JSONPath (supports arrays, nested paths, preserves complex types)
export function extractValue(obj: any, path: string): any {
  if (!obj || !path) {
    Logger.debug(`[JSONPathExtractor] Early return: obj=${!!obj}, path=${!!path}`);
    return '';
  }

  // Handle JSONPath prefix: strip leading "$" or "$."
  let normalizedPath = path;
  if (normalizedPath.startsWith('$.')) {
    normalizedPath = normalizedPath.slice(2); // Remove "$."
  } else if (normalizedPath.startsWith('$')) {
    normalizedPath = normalizedPath.slice(1); // Remove "$"
  }

  const parts = normalizedPath.split('.');
  let current = obj;

  Logger.debug(`[JSONPathExtractor] Extracting path: "${path}" (${parts.length} parts)`);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (current === null || current === undefined) {
      Logger.debug(
        `[JSONPathExtractor] Path "${path}": current is null/undefined at part[${i}]="${part}"`
      );
      return '';
    }

    Logger.debug(
      `[JSONPathExtractor] Path "${path}": part[${i}]="${part}", current type=${Array.isArray(current) ? 'array' : typeof current}`
    );

    // Normal property access first
    current = current[part];

    Logger.debug(
      `[JSONPathExtractor] Path "${path}": after accessing "${part}", current type=${current === null ? 'null' : current === undefined ? 'undefined' : Array.isArray(current) ? 'array' : typeof current}`
    );

    // Check if current is now an array and we have one more part left
    if (Array.isArray(current) && i < parts.length - 1) {
      // Next part is the key to search for
      const searchKey = parts[i + 1];

      Logger.debug(
        `[JSONPathExtractor] Path "${path}": Found array at "${part}", searching for key="${searchKey}" in ${current.length} items`
      );
      if (current.length > 0) {
        Logger.debug(
          `[JSONPathExtractor] Path "${path}": First array item keys: ${Object.keys(current[0]).join(', ')}`
        );
      }

      // Find object in array where obj.key === searchKey
      const found = current.find((item: any) => item.key === searchKey);

      Logger.debug(
        `[JSONPathExtractor] Path "${path}": Array search found=${!!found}, has value=${found && found.value !== undefined}`
      );

      if (found && found.value !== undefined) {
        // Preserve complex types (objects, arrays) instead of converting to string
        const result = found.value;
        const resultType = Array.isArray(result) ? 'array' : typeof result;
        Logger.debug(
          `[JSONPathExtractor] Path "${path}": Returning array value (type=${resultType})`
        );
        return result;
      }

      Logger.debug(
        `[JSONPathExtractor] Path "${path}": Array search failed, returning empty string`
      );
      return '';
    }
  }

  // Return final value
  if (current === null || current === undefined) {
    Logger.debug(
      `[JSONPathExtractor] Path "${path}": Final value is null/undefined, returning empty string`
    );
    return '';
  }

  // Preserve complex types (objects, arrays) as-is for agent replay and other use cases
  if (typeof current === 'object') {
    Logger.debug(`[JSONPathExtractor] Path "${path}": Returning object/array as-is`);
    return current;
  }

  // Convert primitives to strings for backward compatibility
  const result = typeof current === 'string' ? current : String(current);
  Logger.debug(
    `[JSONPathExtractor] Path "${path}": Returning primitive (type=${typeof current}, length=${result.length})`
  );
  return result;
}

// DEPRECATED: Use applyOutputSchema from schemaTransformer.ts (supports all connector types, will be removed in v2.0)
export function extractFromCloudWatchEvent(
  event: any,
  outputSchema: Record<string, string>
): Record<string, any> {
  const result: Record<string, any> = {};

  // Parse the params from msg field if it exists
  let parsedData: any = null;

  if (event.message?.msg) {
    const msgContent = event.message.msg;
    const paramsMatch = msgContent.match(/\[generateTextLambda\] params: (.+)/);

    if (paramsMatch) {
      try {
        const paramsObj = JSON.parse(paramsMatch[1]);
        parsedData = paramsObj;
      } catch (_error) {
        Logger.warn(`[JSONPathExtractor] Failed to parse params JSON from msg field`);
      }
    }
  }

  // Extract each field according to outputSchema
  for (const [outputKey, extractionPath] of Object.entries(outputSchema)) {
    let value = '';

    // Try to extract from parsed params first
    if (parsedData) {
      value = extractValue(parsedData, extractionPath);
    }

    // Fallback: try to extract from event.message directly
    // Note: We only try fallback if parsedData didn't exist or extraction returned empty
    // An empty string return could mean either "path not found" or "value is empty"
    // For our use case with CloudWatch logs, if parsedData exists, we trust its result
    if (!parsedData && event.message) {
      value = extractValue(event.message, extractionPath);
    }

    result[outputKey] = value;
  }

  // Also preserve metadata fields for test identification
  result._metadata = {
    recommendationId: event.message?.recommendationId,
    jobId: event.message?.jobId,
    timestamp: event.timestamp,
  };

  return result;
}
