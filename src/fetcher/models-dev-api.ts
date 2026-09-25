/**
 * models.dev/api.json 价格数据拉取器与预索引表构建
 */

export interface ModelCost {
  input: number;
  output: number;
  cache_read?: number;
  cache_write?: number;
}

export interface PreIndexedCostTables {
  officialMap: Map<string, ModelCost>;
  globalExactMap: Map<string, ModelCost>;
  tailMap: Map<string, ModelCost>;
  prefixCandidates: Array<{ prefix: string; cost: ModelCost }>;
}

export const DEFAULT_MODELS_DEV_API_URL = "https://models.dev/api.json";
export const DEFAULT_MODELS_DEV_API_TIMEOUT_MS = 10000;

/** 官方原厂 Provider 白名单（按优先级排序） */
const OFFICIAL_PROVIDERS = new Set([
  "openai",
  "google",
  "anthropic",
  "deepseek",
  "xai",
  "meta",
  "mistral",
  "tencent",
  "alibaba",
  "zhipu",
  "zai",
  "cohere",
]);

let memoryCachePromise: Promise<PreIndexedCostTables | null> | null = null;

function normalizeCost(raw: any): ModelCost | null {
  if (!raw || typeof raw !== "object") return null;
  const input = typeof raw.input === "number" ? raw.input : undefined;
  const output = typeof raw.output === "number" ? raw.output : undefined;
  if (
    input === undefined ||
    output === undefined ||
    !Number.isFinite(input) ||
    !Number.isFinite(output) ||
    input < 0 ||
    output < 0
  ) {
    return null;
  }
  const result: ModelCost = { input, output };
  if (typeof raw.cache_read === "number" && Number.isFinite(raw.cache_read) && raw.cache_read >= 0) {
    result.cache_read = raw.cache_read;
  }
  if (typeof raw.cache_write === "number" && Number.isFinite(raw.cache_write) && raw.cache_write >= 0) {
    result.cache_write = raw.cache_write;
  }
  return result;
}

/**
 * 将 api.json 原始响应转换为 O(1) 预索引表
 */
export function buildCostIndex(data: any): PreIndexedCostTables {
  const officialMap = new Map<string, ModelCost>();
  const globalExactMap = new Map<string, ModelCost>();
  const tailMap = new Map<string, ModelCost>();
  const prefixMap = new Map<string, ModelCost>();

  if (!data || typeof data !== "object") {
    return { officialMap, globalExactMap, tailMap, prefixCandidates: [] };
  }

  for (const [providerId, provider] of Object.entries<any>(data)) {
    if (!provider || !provider.models || typeof provider.models !== "object") continue;
    const isOfficial = OFFICIAL_PROVIDERS.has(providerId.toLowerCase());

    for (const [modelId, model] of Object.entries<any>(provider.models)) {
      const cost = normalizeCost(model?.cost);
      if (!cost) continue;

      const lowerModelId = modelId.toLowerCase().trim();
      const parts = lowerModelId.split("/");
      const tail = parts[parts.length - 1];

      if (isOfficial) {
        if (!officialMap.has(lowerModelId)) officialMap.set(lowerModelId, cost);
        if (!officialMap.has(tail)) officialMap.set(tail, cost);
        // 关键整改 (ISSUE-01)：前缀候选池仅收录官方原厂白名单模型，杜绝第三方抢占与无序膨胀
        prefixMap.set(tail, cost);
      }

      if (!globalExactMap.has(lowerModelId)) globalExactMap.set(lowerModelId, cost);
      if (!tailMap.has(tail)) tailMap.set(tail, cost);
    }
  }

  // 按前缀长度降序排序，确保最长公共前缀优先命中
  const prefixCandidates = Array.from(prefixMap.entries())
    .map(([prefix, cost]) => ({ prefix, cost }))
    .sort((a, b) => b.prefix.length - a.prefix.length);

  return { officialMap, globalExactMap, tailMap, prefixCandidates };
}

/**
 * 拉取并缓存 api.json 价格表
 */
export async function fetchModelsDevApiData(
  source: string = DEFAULT_MODELS_DEV_API_URL,
  timeoutMs: number = DEFAULT_MODELS_DEV_API_TIMEOUT_MS
): Promise<PreIndexedCostTables | null> {
  if (memoryCachePromise) return memoryCachePromise;

  memoryCachePromise = (async () => {
    try {
      const resp = await fetch(source, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs), // 关键整改 (ISSUE-02)：添加超时保护
      });
      if (!resp.ok) {
        console.warn(`[cost-fetcher] Failed to fetch ${source}: status ${resp.status}`);
        memoryCachePromise = null; // 关键整改 (ISSUE-03)：网络失败重置缓存以具备自愈重试能力
        return null;
      }
      const data = await resp.json();
      return buildCostIndex(data);
    } catch (err) {
      console.warn(`[cost-fetcher] Error fetching ${source}:`, err);
      memoryCachePromise = null; // 关键整改 (ISSUE-03)：异常时重置缓存
      return null;
    }
  })();

  return memoryCachePromise;
}

/** 测试隔离重置函数 */
export function __resetModelsDevApiCacheForTest(): void {
  memoryCachePromise = null;
}
