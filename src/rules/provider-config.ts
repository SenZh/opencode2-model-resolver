import type { ModelLimit, ModelRule } from "../types.js";

/**
 * Provider 的 modelsDiscovery 配置（两种配置格式共用同一结构）
 */
export interface ModelsDiscoveryConfig {
  enabled?: boolean;
  endpoint?: string;
  timeoutMs?: number;
  include?: string[];
  exclude?: string[];
  rules?: ModelRule[];
  defaultLimit?: Partial<ModelLimit>;
  smartModelName?: boolean;
  showProviderName?: boolean;
  /** showProviderName 的别名 */
  appendProviderName?: boolean;
  modelInfoFormat?: string;
}

/**
 * 单个 provider 的已解析配置。
 *
 * 配置格式演进：
 * - V2（新）：`providers.<id>.settings.{baseURL,apiKey,modelsDiscovery}`，展示名取 `providers.<id>.name`
 * - V1（旧）：`provider.<id>.options.{baseURL,apiKey,modelsDiscovery}`，展示名取 `provider.<id>.name`
 *
 * 两段同 id 时取新格式（与 OpenCode 运行时「新覆盖旧」的合并方向一致）。
 */
export interface ResolvedProviderConfig {
  /** 是否在配置中找到该 provider */
  found: boolean;
  /** 命中的配置格式，便于日志与测试断言 */
  source: "v2" | "v1" | "none";
  /** 仅在配置中该字段为 plain object 时存在 */
  discovery?: ModelsDiscoveryConfig;
  /** 已去除全部尾斜杠 */
  baseURL: string;
  /** 空串表示"配置未提供"，由调用方决定是否回退 */
  apiKey: string;
  /** 已 trim；空则回退 providerId */
  name: string;
}

/** 是否为普通对象（排除 null / 数组） */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 从原始配置对象中提取已知字段并做字段级类型校验。
 *
 * 配置来自用户手写 JSON，类型不可信（如 `endpoint: 42`）。此函数只保留
 * 类型正确的已知字段，其余丢弃，避免把脏类型透传给消费方。
 */
function pickDiscoveryConfig(raw: Record<string, unknown>): ModelsDiscoveryConfig {
  const out: ModelsDiscoveryConfig = {};
  if (typeof raw.enabled === "boolean") out.enabled = raw.enabled;
  if (typeof raw.endpoint === "string") out.endpoint = raw.endpoint;
  if (typeof raw.timeoutMs === "number") out.timeoutMs = raw.timeoutMs;
  if (Array.isArray(raw.include)) out.include = raw.include.filter((v) => typeof v === "string");
  if (Array.isArray(raw.exclude)) out.exclude = raw.exclude.filter((v) => typeof v === "string");
  if (Array.isArray(raw.rules)) out.rules = raw.rules.filter(isPlainObject) as unknown as ModelRule[];
  if (isPlainObject(raw.defaultLimit)) out.defaultLimit = raw.defaultLimit as Partial<ModelLimit>;
  if (typeof raw.smartModelName === "boolean") out.smartModelName = raw.smartModelName;
  if (typeof raw.showProviderName === "boolean") out.showProviderName = raw.showProviderName;
  if (typeof raw.appendProviderName === "boolean") out.appendProviderName = raw.appendProviderName;
  if (typeof raw.modelInfoFormat === "string") out.modelInfoFormat = raw.modelInfoFormat;
  return out;
}

/** 去除字符串尾部全部斜杠 */
function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

/** 从任意容器对象中安全取出字符串字段 */
function readString(container: Record<string, unknown> | undefined, key: string): string {
  const value = container?.[key];
  return typeof value === "string" ? value : "";
}

/**
 * 解析单个 provider 在配置中的连接信息与 discovery 配置。
 *
 * 优先级为 **provider 级**（非字段级）：新格式段存在该 id 即整体采用新格式，
 * 避免把两段混成一个 OpenCode 运行时并不存在的中间态。
 *
 * @param providerId provider 的键名（即运行时 providerID）
 * @param config     已 JSON.parse 的 opencode.json 内容
 */
export function resolveProviderConfig(
  providerId: string,
  config: unknown
): ResolvedProviderConfig {
  const root = isPlainObject(config) ? config : undefined;

  const v2Entry = root?.providers;
  const v2Provider = isPlainObject(v2Entry) ? v2Entry[providerId] : undefined;
  if (isPlainObject(v2Provider)) {
    const settings = isPlainObject(v2Provider.settings) ? v2Provider.settings : undefined;
    const rawName = readString(v2Provider, "name").trim();
    return {
      found: true,
      source: "v2",
      discovery: isPlainObject(settings?.modelsDiscovery)
        ? pickDiscoveryConfig(settings!.modelsDiscovery as Record<string, unknown>)
        : undefined,
      baseURL: stripTrailingSlashes(readString(settings, "baseURL")),
      apiKey: readString(settings, "apiKey"),
      name: rawName || providerId,
    };
  }

  const v1Entry = root?.provider;
  const v1Provider = isPlainObject(v1Entry) ? v1Entry[providerId] : undefined;
  if (isPlainObject(v1Provider)) {
    const options = isPlainObject(v1Provider.options) ? v1Provider.options : undefined;
    const rawName = readString(v1Provider, "name").trim();
    return {
      found: true,
      source: "v1",
      discovery: isPlainObject(options?.modelsDiscovery)
        ? pickDiscoveryConfig(options!.modelsDiscovery as Record<string, unknown>)
        : undefined,
      baseURL: stripTrailingSlashes(readString(options, "baseURL")),
      apiKey: readString(options, "apiKey"),
      name: rawName || providerId,
    };
  }

  return {
    found: false,
    source: "none",
    discovery: undefined,
    baseURL: "",
    apiKey: "",
    name: providerId,
  };
}

/**
 * 收集所有「配置了有效 modelsDiscovery 且未显式禁用」的 provider 目标。
 *
 * - 两段并集去重：新格式 `providers` 先、旧格式 `provider` 后，同一 id 只出现一次（新格式优先）
 * - `discovery` 必须为 plain object（`true` / 字符串 / 数组一律视为无配置）
 * - `discovery.enabled === false` 的 provider 被过滤
 *
 * 返回的 `discovery` 保证为非空对象（已过滤），调用方无需再判空。
 * 这是扫描循环的核心逻辑，抽为纯函数以便单测守护。
 */
export function collectDiscoveryTargets(config: unknown): Array<{
  providerId: string;
  config: ResolvedProviderConfig;
  /** 已确认非空 */
  discovery: ModelsDiscoveryConfig;
}> {
  const root = isPlainObject(config) ? config : undefined;
  if (!root) return [];

  const seen = new Set<string>();
  const orderedIds: string[] = [];

  for (const sectionKey of ["providers", "provider"] as const) {
    const section = root[sectionKey];
    if (!isPlainObject(section)) continue;
    for (const providerId of Object.keys(section)) {
      if (seen.has(providerId)) continue;
      seen.add(providerId);
      orderedIds.push(providerId);
    }
  }

  const targets: Array<{
    providerId: string;
    config: ResolvedProviderConfig;
    discovery: ModelsDiscoveryConfig;
  }> = [];
  for (const providerId of orderedIds) {
    const resolved = resolveProviderConfig(providerId, root);
    const discovery = resolved.discovery;
    if (!discovery) continue;
    if (discovery.enabled === false) continue;
    targets.push({ providerId, config: resolved, discovery });
  }
  return targets;
}
