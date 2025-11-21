import { z } from 'zod';
import { getAttributeDefinitions } from './registry';

export async function buildQualityAssessmentSchema(
  attributeNames: string[]
): Promise<z.ZodObject<any>> {
  const definitions = await getAttributeDefinitions(attributeNames);
  const schemaShape: Record<string, any> = {};

  for (const attributeName of attributeNames) {
    const def = definitions[attributeName];

    // Extract labels from this attribute's rating scale
    let gradeEnum: z.ZodEnum<[string, string, ...string[]]> | z.ZodString;

    if (def && def.rating) {
      const labels = (['5', '4', '3', '2', '1'] as const)
        .map(score => def.rating[score]?.label)
        .filter(label => label !== undefined) as string[];

      // Ensure we have at least 2 unique labels for z.enum (Zod requirement)
      gradeEnum = labels.length >= 2 ? z.enum(labels as [string, string, ...string[]]) : z.string();
    } else {
      // Fallback for attributes without rating definitions
      gradeEnum = z.string();
    }

    // 1-5 = Quality rating scale
    schemaShape[attributeName] = z.object({
      score: z.number().min(1).max(5),
      grade: gradeEnum,
      reason: z.string(),
    });
  }

  // Make all attributes optional to allow judge to omit non-applicable attributes
  return z.object(schemaShape).partial();
}

export async function generateCapabilitiesDescription(attributeNames: string[]): Promise<string> {
  const definitions = await getAttributeDefinitions(attributeNames);

  return attributeNames
    .map(name => {
      const def = definitions[name];
      if (!def) {
        return `**${name}** - Definition not found`;
      }

      let description = `
**${def.name}**

${def.description}

**Rating Scale:**
• 5 (${def.rating['5'].label}): ${def.rating['5'].description}
• 4 (${def.rating['4'].label}): ${def.rating['4'].description}
• 3 (${def.rating['3'].label}): ${def.rating['3'].description}
• 2 (${def.rating['2'].label}): ${def.rating['2'].description}
• 1 (${def.rating['1'].label}): ${def.rating['1'].description}
`.trim();

      if (def.examples) {
        description += '\n\nExamples:';
        if (def.examples.rating5) {
          description += `\n✓ Rating 5: ${def.examples.rating5}`;
        }
        if (def.examples.rating3) {
          description += `\n○ Rating 3: ${def.examples.rating3}`;
        }
        if (def.examples.rating1) {
          description += `\n✗ Rating 1: ${def.examples.rating1}`;
        }
      }

      return description;
    })
    .join('\n\n---\n\n');
}

export async function generateSchemaShape(attributeNames: string[]): Promise<string> {
  const definitions = await getAttributeDefinitions(attributeNames);
  const shape: Record<string, any> = {};

  for (const name of attributeNames) {
    const def = definitions[name];
    if (!def || !def.rating) {
      // Fallback for attributes without rating definitions
      shape[name] = {
        score: '<number: 1-5>',
        grade: '<string>',
        reason: '<brief explanation>',
      };
      continue;
    }

    // Extract labels from this attribute's rating scale (in score order 5→1)
    const labels = (['5', '4', '3', '2', '1'] as const)
      .map(score => def.rating[score]?.label)
      .filter(label => label !== undefined)
      .map(label => `"${label}"`);

    const gradeEnum = labels.join(' | ');

    shape[name] = {
      score: '<number: 1-5>',
      grade: `<string: ${gradeEnum}>`,
      reason: '<brief explanation>',
    };
  }

  return JSON.stringify(shape, null, 2);
}
