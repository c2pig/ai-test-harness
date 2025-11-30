import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../logger';
import { ModelPricing, PricingCacheEntry } from './types';

export class PricingCache {
  private memoryCache: Map<string, PricingCacheEntry> = new Map();
  private readonly cacheDir: string;
  private readonly memoryTtlMs: number;
  private readonly fileTtlMs: number;

  constructor(
    cacheDir: string = '.cache/pricing',
    memoryTtlHours: number = 1,
    fileTtlHours: number = 24
  ) {
    this.cacheDir = path.resolve(process.cwd(), cacheDir);
    this.memoryTtlMs = memoryTtlHours * 60 * 60 * 1000;
    this.fileTtlMs = fileTtlHours * 60 * 60 * 1000;

    this.ensureCacheDir();
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      Logger.debug(`[PricingCache] Created cache directory: ${this.cacheDir}`);
    }
  }

  private getCacheKey(modelId: string, region: string): string {
    return `${region}:${modelId}`;
  }

  private getCacheFilePath(cacheKey: string): string {
    const safeKey = cacheKey.replace(/[^a-zA-Z0-9:-]/g, '_');
    return path.join(this.cacheDir, `${safeKey}.json`);
  }

  getFromMemory(modelId: string, region: string): ModelPricing | null {
    const key = this.getCacheKey(modelId, region);
    const entry = this.memoryCache.get(key);

    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }

    Logger.debug(`[PricingCache] Memory cache hit for ${modelId}`);
    return entry.pricing;
  }

  async getFromFile(modelId: string, region: string): Promise<ModelPricing | null> {
    const key = this.getCacheKey(modelId, region);
    const filePath = this.getCacheFilePath(key);

    try {
      if (!fs.existsSync(filePath)) return null;

      const data = fs.readFileSync(filePath, 'utf-8');
      const entry: PricingCacheEntry = JSON.parse(data);

      if (Date.now() > entry.expiresAt) {
        fs.unlinkSync(filePath);
        return null;
      }

      Logger.debug(`[PricingCache] File cache hit for ${modelId}`);

      // Promote to memory cache
      this.setInMemory(modelId, region, entry.pricing);

      return entry.pricing;
    } catch (error) {
      Logger.warn(`[PricingCache] Error reading file cache for ${modelId}: ${error}`);
      return null;
    }
  }

  setInMemory(modelId: string, region: string, pricing: ModelPricing): void {
    const key = this.getCacheKey(modelId, region);
    const entry: PricingCacheEntry = {
      pricing,
      expiresAt: Date.now() + this.memoryTtlMs,
    };

    this.memoryCache.set(key, entry);
  }

  async setInFile(modelId: string, region: string, pricing: ModelPricing): Promise<void> {
    const key = this.getCacheKey(modelId, region);
    const filePath = this.getCacheFilePath(key);

    const entry: PricingCacheEntry = {
      pricing,
      expiresAt: Date.now() + this.fileTtlMs,
    };

    try {
      fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
      Logger.debug(`[PricingCache] Cached ${modelId} to file`);
    } catch (error) {
      Logger.warn(`[PricingCache] Failed to write file cache for ${modelId}: ${error}`);
    }
  }

  set(modelId: string, region: string, pricing: ModelPricing): void {
    this.setInMemory(modelId, region, pricing);
    this.setInFile(modelId, region, pricing).catch(() => {});
  }

  clearMemory(): void {
    this.memoryCache.clear();
    Logger.debug('[PricingCache] Memory cache cleared');
  }

  clearAll(): void {
    this.clearMemory();

    try {
      if (fs.existsSync(this.cacheDir)) {
        fs.readdirSync(this.cacheDir).forEach(file => {
          fs.unlinkSync(path.join(this.cacheDir, file));
        });
        Logger.debug('[PricingCache] File cache cleared');
      }
    } catch (error) {
      Logger.warn(`[PricingCache] Error clearing file cache: ${error}`);
    }
  }
}
