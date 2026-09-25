import fs from "fs";
import path from "path";
import os from "os";
import { resolveAuthoritativeLimit } from "./rules/limits-database.js";
import { fetchModelsDevData, lookupModelsDev } from "./fetcher/models-dev.js";
import type { ModelsDevModel } from "./fetcher/models-dev.js";
import {
  formatSmartModelName,
  appendProviderNameToModelName,
  shouldIncludeModel,
  resolveCapabilities,
} from "./rules/filter.js";
import type { ModelCapabilities } from "./rules/filter.js";
import type { ModelLimit, ModelRule, RawOpenAIModel } from "./types.js";

/** 缓存文件 schema 版本号，格式变更时递增即可让旧缓存自动失效 */
const CACHE_SCHEMA_VERSION = 2;

interface CachedModelEntry {
  id: string;
  name: string;
  limit: { context: number; output: number; input?: number };
  reasoning: boolean;
  capabilities: ModelCapabilities;
}

interface CachedModelsPayload {
  schemaVersion: number;
  updatedAt: number;
  models: CachedModelEntry[];
}

/**
 * 构建单条缓存条目：应用字段级失败防护。
 *
 * 防护仅在「models.dev 整体不可用」时生效——此时本次算出的可能全是规则值，
 * 若旧缓存已有可用值则保留，避免把已固化的正确值覆写成规则值。
 *
 * 注意必须传入 `modelsDevAvailable`（models.dev 缓存非空）来区分两种
 * `matchedModelsDev=false` 的情形：
 *   - models.dev 不可用（available=false）→ 保护旧值
 *   - models.dev 可用但该模型本就没有条目（available=true）→ 正常写入，不冻结
 */
export function buildCachedEntry(
  entry: CachedModelEntry,
  matchedModelsDev: boolean,
  prev: CachedModelEntry | undefined,
  modelsDevAvailable: boolean
): CachedModelEntry {
  const prevHasUsableLimit =
    prev &&
    typeof prev.limit?.context === "number" &&
    prev.limit.context > 0 &&
    typeof prev.limit?.output === "number" &&
    prev.limit.output > 0;
  if (!modelsDevAvailable && !matchedModelsDev && prevHasUsableLimit) {
    return prev;
  }
  return entry;
}

/**
 * 解析缓存文件内容，返回模型数组；无法识别（旧格式/损坏/版本不符）时返回 null
 */
export function parseCachedModels(raw: string): CachedModelEntry[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.schemaVersion === CACHE_SCHEMA_VERSION &&
      Array.isArray(parsed.models)
    ) {
      return parsed.models as CachedModelEntry[];
    }
    // 旧格式（裸数组）或版本不符 → 视为过期，交由调用方重建
    return null;
  } catch {
    return null;
  }
}

/**
 * 解析单个 provider 的模型列表为可缓存的条目数组。
 *
 * 这是 `setup()` 扫描路径的核心逻辑，抽为纯函数以便测试：
 *   - 权威 limit 解析（models.dev 优先）
 *   - 字段级失败防护（models.dev 整体不可用时保留旧值）
 *
 * @param rawModels       远程探测到的原始模型列表
 * @param modelsDevCache  models.dev 权威数据库
 * @param options         过滤/命名/规则等配置
 * @param prevEntries     上次缓存的条目（用于失败防护）
 */
export function resolveProviderModels(
  rawModels: RawOpenAIModel[],
  modelsDevCache: Map<string, ModelsDevModel> | undefined,
  options: {
    include?: string[];
    exclude?: string[];
    rules?: ModelRule[];
    defaultLimit?: Partial<ModelLimit>;
    smartModelName?: boolean;
    shouldAppendProviderName?: boolean;
    providerName?: string;
  },
  prevEntries?: CachedModelEntry[]
): CachedModelEntry[] {
  const modelsDevAvailable = Boolean(modelsDevCache && modelsDevCache.size > 0);

  const prevById: Record<string, CachedModelEntry> = {};
  for (const m of prevEntries || []) {
    if (m && m.id) prevById[m.id] = m;
  }

  const result: CachedModelEntry[] = [];

  for (const raw of rawModels) {
    const modelId = raw.id;
    if (!modelId) continue;

    // 先查 models.dev：既用于过滤（模态判定），也用于能力映射
    const devInfo =
      modelsDevCache && modelsDevCache.size > 0
        ? lookupModelsDev(modelId, modelsDevCache)
        : undefined;

    if (!shouldIncludeModel(raw, options.include, options.exclude, devInfo)) continue;

    let name =
      options.smartModelName !== false ? formatSmartModelName(modelId) : modelId;
    if (options.shouldAppendProviderName) {
      name = appendProviderNameToModelName(name, options.providerName);
    }

    const authoritative = resolveAuthoritativeLimit(raw, {
      modelsDevCache,
      rules: options.rules,
      defaultLimit: options.defaultLimit,
    });

    result.push(
      buildCachedEntry(
        {
          id: modelId,
          name,
          limit: authoritative.limit,
          reasoning: authoritative.reasoning === true,
          capabilities: resolveCapabilities(devInfo),
        },
        authoritative.matchedModelsDev,
        prevById[modelId],
        modelsDevAvailable
      )
    );
  }

  return result;
}

function getHomeDir(): string {
  return os.homedir() || process.env.USERPROFILE || process.env.HOME || "";
}

function getCacheDir(): string {
  return path.join(getHomeDir(), ".cache", "opencode2-model-resolver");
}

function log(msg: string) {
  const line = `[${new Date().toISOString()}] [resolver] ${msg}\n`;
  try {
    const dir = getCacheDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "runtime.log"), line);
  } catch {}
}

/**
 * 从本地 OpenCode 系统凭证文件读取指定 provider 的 API Key
 */
function resolveSystemApiKey(providerId: string): string {
  try {
    const authPath = path.join(getHomeDir(), ".local", "share", "opencode", "auth.json");
    if (fs.existsSync(authPath)) {
      const auth = JSON.parse(fs.readFileSync(authPath, "utf8"));
      const entry = auth[providerId];
      if (entry) {
        if (typeof entry === "string") return entry;
        return entry.key || entry.apiKey || entry.access || entry.token || "";
      }
    }
  } catch (e: any) {
    log(`Failed to read auth.json for [${providerId}]: ${e.message}`);
  }

  // 尝试环境变量
  const envKey = process.env[`${providerId.toUpperCase()}_API_KEY`] ||
                 process.env[`${providerId.toUpperCase()}_KEY`];
  if (envKey) return envKey;

  return "";
}

export default {
  id: "opencode2-model-resolver",
  setup: (ctx: any) => {
    log("Plugin setup running!");

    // 1. 同步注册 provider transform 钩子，优先从磁盘独立缓存注入已有模型（保障瞬间冷启动）
    if (ctx.provider && ctx.provider.transform) {
      ctx.provider.transform((providers: any) => {
        log("Inside ctx.provider.transform!");
        try {
          const cacheDir = getCacheDir();
          if (!fs.existsSync(cacheDir)) return;

          let config: any = null;
          try {
            const configPath = path.join(getHomeDir(), ".config", "opencode", "opencode.json");
            if (fs.existsSync(configPath)) {
              config = JSON.parse(fs.readFileSync(configPath, "utf8"));
            }
          } catch {}

          const files = fs.readdirSync(cacheDir).filter((f: string) => f.endsWith("-models.json"));
          for (const file of files) {
            const providerId = file.replace(/-models\.json$/, "");
            const cachedModels = parseCachedModels(
              fs.readFileSync(path.join(cacheDir, file), "utf8")
            );
            if (!cachedModels) {
              log(`Skipped stale/incompatible cache for [${providerId}] (schema mismatch or legacy format)`);
              continue;
            }
            log(`Loading ${cachedModels.length} cached models into [${providerId}]...`);

            const providerObj = config?.provider?.[providerId];
            const discovery = providerObj?.options?.modelsDiscovery;
            const shouldAppend = Boolean(discovery?.showProviderName || discovery?.appendProviderName);
            const providerName = (typeof providerObj?.name === "string" && providerObj.name.trim())
              ? providerObj.name.trim()
              : providerId;

            for (const m of cachedModels) {
              providers.models.update(providerId, m.id, (modelDef: any) => {
                let name = m.name || m.id;
                if (shouldAppend) {
                  name = appendProviderNameToModelName(name, providerName);
                }
                modelDef.name = name;
                if (m.limit) {
                  modelDef.limit = m.limit;
                }
                if (m.reasoning !== undefined) {
                  modelDef.reasoning = m.reasoning;
                }
                // 能力：OpenCode V2 的 Model.Info 唯一有效位置
                if (m.capabilities) {
                  modelDef.capabilities = m.capabilities;
                }
              });
            }
          }
        } catch (e: any) {
          log(`Error injecting cached models in transform: ${e.message}`);
        }
      });
    }

    // 2. 异步在后台扫描所有配置了 modelsDiscovery 的 Provider
    (async () => {
      try {
        const configPath = path.join(getHomeDir(), ".config", "opencode", "opencode.json");
        if (!fs.existsSync(configPath)) return;
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

        let needsReload = false;

        // 预热 models.dev 权威数据库（仅一次，失败返回空 Map 不阻塞）
        const modelsDevCache = await fetchModelsDevData();
        log(`models.dev cache loaded: ${modelsDevCache ? modelsDevCache.size : 0} keys`);

        for (const [providerId, providerObj] of Object.entries(config.provider || {})) {
          const provider = providerObj as any;
          const discovery = provider?.options?.modelsDiscovery;
          if (!discovery || discovery.enabled === false) {
            continue;
          }

          log(`Discovered provider [${providerId}] with modelsDiscovery enabled`);

          // 获取 API Key
          const apiKey = provider.options?.apiKey || resolveSystemApiKey(providerId);
          const baseURL = (provider.options?.baseURL || "").replace(/\/+$/, "");
          if (!baseURL) {
            log(`Provider [${providerId}] baseURL is missing, skipping`);
            continue;
          }

          const endpoint = discovery.endpoint || "/models";
          const url = `${baseURL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
          const timeoutMs = discovery.timeoutMs || 30000;

          log(`Fetching [${providerId}] models from ${url}...`);

          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            const headers: Record<string, string> = {};
            if (apiKey) {
              headers["Authorization"] = `Bearer ${apiKey}`;
            }

            const res = await fetch(url, {
              headers,
              signal: controller.signal
            });
            clearTimeout(timer);

            if (!res.ok) {
              log(`Fetch [${providerId}] failed with status: ${res.status}`);
              continue;
            }

            const json: any = await res.json();
            const rawModels = json.data || (Array.isArray(json) ? json : []);
            log(`Fetched ${rawModels.length} raw models for [${providerId}]`);

            // 处理模型列表
            const shouldAppendProviderName = Boolean(
              discovery.showProviderName || discovery.appendProviderName
            );
            const providerName = (typeof provider.name === "string" && provider.name.trim())
              ? provider.name.trim()
              : providerId;

            // 读取旧缓存用于字段级失败防护（格式不符则为空）
            const cacheFilePath = path.join(getCacheDir(), `${providerId}-models.json`);
            let prevEntries: CachedModelEntry[] | undefined;
            try {
              if (fs.existsSync(cacheFilePath)) {
                prevEntries = parseCachedModels(fs.readFileSync(cacheFilePath, "utf8")) || undefined;
              }
            } catch {}

            const processedModels = resolveProviderModels(
              rawModels,
              modelsDevCache,
              {
                include: discovery.include,
                exclude: discovery.exclude,
                rules: discovery.rules,
                defaultLimit: discovery.defaultLimit,
                smartModelName: discovery.smartModelName,
                shouldAppendProviderName,
                providerName,
              },
              prevEntries
            );

            // 保存到独立缓存（带 schema 版本号，便于格式演进时自动失效）
            const cacheDir = getCacheDir();
            if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
            const payload: CachedModelsPayload = {
              schemaVersion: CACHE_SCHEMA_VERSION,
              updatedAt: Date.now(),
              models: processedModels,
            };
            fs.writeFileSync(
              cacheFilePath,
              JSON.stringify(payload, null, 2),
              "utf8"
            );

            log(`Successfully processed and cached ${processedModels.length} models for [${providerId}]`);
            needsReload = true;
          } catch (fetchErr: any) {
            log(`Error fetching models for [${providerId}]: ${fetchErr.message}`);
          }
        }

        // 如果获取到了新数据，触发 OpenCode2 reload 重新应用 transform
        if (needsReload && ctx.provider && ctx.provider.reload) {
          log("Triggering ctx.provider.reload() to apply fresh models...");
          await ctx.provider.reload();
          log("ctx.provider.reload() finished!");
        }
      } catch (err: any) {
        log(`Background discovery cycle error: ${err.message}`);
      }
    })();
  }
};
