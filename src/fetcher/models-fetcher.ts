import type { RawOpenAIModel } from "../types.js";

export interface FetchModelsOptions {
  baseURL: string;
  apiKey?: string;
  endpoint?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * 组装请求 URL
 */
export function buildModelsUrl(baseURL: string, endpoint?: string): string {
  const cleanBase = baseURL.trim().replace(/\/+$/, "");

  // 如果用户显式给出了 endpoint
  if (endpoint && endpoint.trim().length > 0) {
    const cleanEndpoint = endpoint.trim().replace(/^\/+/, "");
    // 如果 endpoint 已经是一个完整的 http(s) URL
    if (/^https?:\/\//i.test(endpoint)) {
      return endpoint;
    }
    return `${cleanBase}/${cleanEndpoint}`;
  }

  // 默认智能探测逻辑：
  // 1. 如果 baseURL 已经以 /v1 或 /v1beta 结尾，拼 /models
  if (/\/v\d+(?:[a-zA-Z0-9_-]+)?$/i.test(cleanBase)) {
    return `${cleanBase}/models`;
  }

  // 2. 如果 baseURL 没有 /v1，默认拼 /v1/models
  return `${cleanBase}/v1/models`;
}

/**
 * 从远程 Provider 拉取模型列表
 */
export async function fetchRemoteModels(
  options: FetchModelsOptions
): Promise<RawOpenAIModel[]> {
  const url = buildModelsUrl(options.baseURL, options.endpoint);
  const timeoutMs = options.timeoutMs || 6000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const reqHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers || {}),
  };

  if (options.apiKey && options.apiKey.trim().length > 0) {
    reqHeaders["Authorization"] = `Bearer ${options.apiKey.trim()}`;
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: reqHeaders,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} ${response.statusText} (${errText.slice(0, 150)})`);
    }

    const json = (await response.json()) as any;

    // 标准 OpenAI 响应: { object: "list", data: [...] }
    if (json && Array.isArray(json.data)) {
      return json.data as RawOpenAIModel[];
    }

    // 某些轻量引擎直接返回数组: [...]
    if (Array.isArray(json)) {
      return json as RawOpenAIModel[];
    }

    // 某些包装返回: { models: [...] }
    if (json && Array.isArray(json.models)) {
      return json.models as RawOpenAIModel[];
    }

    console.warn(`[opencode-models-discovery-v2] 未能识别的响应格式: ${url}`);
    return [];
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`请求超时 (${timeoutMs}ms): ${url}`);
    }
    throw new Error(`请求失败: ${err.message || String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}
