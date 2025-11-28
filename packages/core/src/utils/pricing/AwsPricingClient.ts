import { Logger } from '../logger';
import { ModelPricing } from './types';

export class AwsPricingClient {
  private readonly baseUrl = 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws';
  private readonly serviceCode = 'AmazonBedrock';

  async fetchPricing(region: string = 'us-east-1'): Promise<Map<string, ModelPricing>> {
    const url = `${this.baseUrl}/${this.serviceCode}/current/index.json`;

    try {
      Logger.debug(`[AwsPricingClient] Fetching pricing from AWS API...`);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const pricingMap = this.parsePricingData(data, region);

      Logger.debug(`[AwsPricingClient] ✓ Fetched pricing for ${pricingMap.size} models`);
      return pricingMap;
    } catch (error) {
      Logger.error(`[AwsPricingClient] Failed to fetch pricing: ${error}`);
      throw error;
    }
  }

  private parsePricingData(data: any, region: string): Map<string, ModelPricing> {
    const pricingMap = new Map<string, ModelPricing>();

    try {
      const products = data.products || {};
      const terms = data.terms?.OnDemand || {};

      for (const [sku, product] of Object.entries<any>(products)) {
        const attributes = product.attributes || {};
        const modelId = this.extractModelId(attributes);

        if (!modelId) continue;

        const pricing = this.extractPricingFromTerms(terms[sku]);
        if (pricing) {
          pricingMap.set(modelId, {
            ...pricing,
            region,
            lastUpdated: new Date().toISOString(),
          });
        }
      }

      return pricingMap;
    } catch (error) {
      Logger.error(`[AwsPricingClient] Error parsing pricing data: ${error}`);
      return new Map();
    }
  }

  private extractModelId(attributes: any): string | null {
    // Try different attribute names that might contain model ID
    return (
      attributes.modelId ||
      attributes.model ||
      attributes.usagetype?.match(/BedrockModel-([\w.-]+)/)?.[1] ||
      null
    );
  }

  private extractPricingFromTerms(termData: any): ModelPricing | null {
    if (!termData) return null;

    try {
      const priceDimensions = Object.values<any>(termData)[0]?.priceDimensions || {};

      let inputPrice: number | null = null;
      let outputPrice: number | null = null;

      for (const dimension of Object.values<any>(priceDimensions)) {
        const description = (dimension.description || '').toLowerCase();
        const priceUsd = parseFloat(dimension.pricePerUnit?.USD || '0');

        if (description.includes('input')) {
          inputPrice = priceUsd;
        } else if (description.includes('output')) {
          outputPrice = priceUsd;
        }
      }

      if (inputPrice !== null && outputPrice !== null) {
        return {
          inputPer1kTokens: inputPrice,
          outputPer1kTokens: outputPrice,
        };
      }

      return null;
    } catch (_error) {
      return null;
    }
  }
}
