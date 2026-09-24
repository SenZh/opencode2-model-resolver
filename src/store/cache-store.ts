import { promises as fs } from "node:fs";
import path from "node:path";

function getCacheDir(): string {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const base = path.join(home, ".cache", "opencode2-model-resolver");
  return base;
}

export interface CachedProviderData {
  updatedAt: number;
  models: Record<string, any>;
}

/**
 * 独立的 Provider 模型持久化缓存管理
 * 存储路径: ~/.cache/opencode2-model-resolver/{providerId}.json
 * 确保永远不回写污染用户的 opencode.json
 */
export class ModelCacheStore {
  private cacheDir: string;

  constructor() {
    this.cacheDir = getCacheDir();
  }

  private getFilePath(providerId: string): string {
    const safeName = providerId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.cacheDir, `${safeName}.json`);
  }

  async read(providerId: string): Promise<Record<string, any> | undefined> {
    const file = this.getFilePath(providerId);
    try {
      const content = await fs.readFile(file, "utf8");
      const data = JSON.parse(content) as CachedProviderData;
      return data.models;
    } catch {
      return undefined;
    }
  }

  async save(providerId: string, models: Record<string, any>): Promise<void> {
    const file = this.getFilePath(providerId);
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      const payload: CachedProviderData = {
        updatedAt: Date.now(),
        models,
      };
      await fs.writeFile(file, JSON.stringify(payload, null, 2), "utf8");
    } catch (err: any) {
      // 缓存写入失败不阻断主流程
    }
  }
}

export const modelCacheStore = new ModelCacheStore();
