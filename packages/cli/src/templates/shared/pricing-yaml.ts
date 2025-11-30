/**
 * config/shared/pricing.yaml template
 */

export function generatePricingYaml(): string {
  return `# Custom Model Pricing (Optional)
# Override or extend default pricing from @ai-test-harness/core
#
# Prices are per 1,000 tokens
# To convert from "per 1M tokens": price_per_1M / 1000

# Example custom model pricing:
# custom.my-model-v1:
#   inputPer1kTokens: 0.001
#   outputPer1kTokens: 0.002
`;
}
