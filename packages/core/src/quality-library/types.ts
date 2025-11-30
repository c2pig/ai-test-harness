export interface QualityAttributeDefinition {
  name: string;
  description: string;
  weight: number;
  category?: string;
  rating: {
    '5': { label: string; description: string };
    '4': { label: string; description: string };
    '3': { label: string; description: string };
    '2': { label: string; description: string };
    '1': { label: string; description: string };
  };
  examples?: {
    rating5?: string;
    rating4?: string;
    rating3?: string;
    rating2?: string;
    rating1?: string;
  };
}

export interface QualityAttributeConfig {
  attributes: string[];
  parameters?: Record<string, any>;
}

export interface AttributeValidationResult {
  valid: boolean;
  invalidAttributes: string[];
  suggestions: Record<string, string[]>;
}
export interface InputConfig {
  name: string;
  placeholder: string;
  description?: string;
}

export interface CalibrationExample {
  category: string;
  description: string;
  guidance: string;
  expectedRating: Record<string, number>;
}

export interface CalibrationConfig {
  enabled: boolean;
  examples: CalibrationExample[];
}

export interface PromptConfig {
  solutionDescription: string;
  inputs: InputConfig[];
  calibration?: CalibrationConfig;
}
