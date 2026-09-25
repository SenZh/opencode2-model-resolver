export interface ModelsDevModel {
  id: string;
  name?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  structured_output?: boolean;
  temperature?: boolean;
  modalities?: {
    input?: string[];
    output?: string[];
  };
  limit?: {
    context?: number;
    input?: number;
    output?: number;
  };
}

export const DEFAULT_MODELS_DEV_URL = "https://models.dev/models.json";

let memoryCache: Map<string, ModelsDevModel> | null = null;

/** 仅供测试使用：清空模块级内存缓存，避免跨用例串扰 */
export function __resetModelsDevCacheForTest(): void {
  memoryCache = null;
}

function isObject(val: unknown): val is Record<string, any> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function parseModelsDevData(data: unknown): Map<string, ModelsDevModel> {
  const map = new Map<string, ModelsDevModel>();
  if (!isObject(data)) return map;

  for (const [providerKey, providerVal] of Object.entries(data)) {
    if (!isObject(providerVal)) continue;

    const modelsObj = isObject(providerVal.models) ? providerVal.models : { [providerKey]: providerVal };

    for (const [modelId, rawModel] of Object.entries(modelsObj)) {
      if (!isObject(rawModel)) continue;

      const id = (typeof rawModel.id === "string" && rawModel.id.length > 0) ? rawModel.id : modelId;
      const cleanId = id.includes("/") ? id : `${providerKey}/${id}`;

      map.set(cleanId.toLowerCase(), {
        id,
        name: typeof rawModel.name === "string" ? rawModel.name : undefined,
        attachment: typeof rawModel.attachment === "boolean" ? rawModel.attachment : undefined,
        reasoning: typeof rawModel.reasoning === "boolean" ? rawModel.reasoning : undefined,
        tool_call: typeof rawModel.tool_call === "boolean" ? rawModel.tool_call : undefined,
        structured_output: typeof rawModel.structured_output === "boolean" ? rawModel.structured_output : undefined,
        modalities: isObject(rawModel.modalities) ? {
          input: Array.isArray(rawModel.modalities.input) ? rawModel.modalities.input : undefined,
          output: Array.isArray(rawModel.modalities.output) ? rawModel.modalities.output : undefined,
        } : undefined,
        limit: isObject(rawModel.limit) ? {
          context: typeof rawModel.limit.context === "number" ? rawModel.limit.context : undefined,
          input: typeof rawModel.limit.input === "number" ? rawModel.limit.input : undefined,
          output: typeof rawModel.limit.output === "number" ? rawModel.limit.output : undefined,
        } : undefined,
      });
    }
  }

  return map;
}

export async function fetchModelsDevData(
  url: string = DEFAULT_MODELS_DEV_URL,
  timeoutMs: number = 8000
): Promise<Map<string, ModelsDevModel>> {
  if (memoryCache && memoryCache.size > 0) {
    return memoryCache;
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return new Map();
    const json = await res.json();
    memoryCache = parseModelsDevData(json);
    return memoryCache;
  } catch {
    return new Map();
  }
}

export function lookupModelsDev(
  modelId: string,
  cache: Map<string, ModelsDevModel>
): ModelsDevModel | undefined {
  if (cache.size === 0) return undefined;

  const target = modelId.toLowerCase().replace(/:[a-zA-Z0-9_-]+$/, "");
  
  // 1. 精确匹配
  if (cache.has(target)) return cache.get(target);

  // 2. 匹配后缀
  for (const [key, value] of cache.entries()) {
    const keyModel = key.split("/").pop() || key;
    if (keyModel === target || keyModel === target.replace(/^(?:openai|anthropic|google|meta|deepseek)\//, "")) {
      return value;
    }
  }

  // 3. 前缀模糊匹配（例如 grok-4.7-build-fast 继承 grok-4.7 的 limits，但禁止覆盖展示名）
  for (const [key, value] of cache.entries()) {
    const keyModel = key.split("/").pop() || key;
    if (target.startsWith(keyModel + "-") || target.startsWith(keyModel + "/")) {
      return {
        ...value,
        name: undefined, // 模糊匹配不借用名称，确保变体模型保留专属名称
      };
    }
  }

  return undefined;
}
