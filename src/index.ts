import fs from "fs";
import path from "path";
import os from "os";
import { resolveModelLimit } from "./rules/limits-database.js";
import { formatSmartModelName, appendProviderNameToModelName, shouldIncludeModel } from "./rules/filter.js";

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

          const files = fs.readdirSync(cacheDir).filter(f => f.endsWith("-models.json"));
          for (const file of files) {
            const providerId = file.replace(/-models\.json$/, "");
            const cachedModels = JSON.parse(fs.readFileSync(path.join(cacheDir, file), "utf8"));
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
            const processedModels = [];
            const shouldAppendProviderName = Boolean(
              discovery.showProviderName || discovery.appendProviderName
            );
            const providerName = (typeof provider.name === "string" && provider.name.trim())
              ? provider.name.trim()
              : providerId;

            for (const raw of rawModels) {
              const modelId = raw.id;
              if (!modelId) continue;

              // 过滤逻辑
              if (!shouldIncludeModel(raw, discovery.include, discovery.exclude)) {
                continue;
              }

              // 展示名
              let name = discovery.smartModelName !== false
                ? formatSmartModelName(modelId)
                : modelId;

              if (shouldAppendProviderName) {
                name = appendProviderNameToModelName(name, providerName);
              }

              // 推断 limits
              const limitResult = resolveModelLimit(
                raw,
                discovery.rules,
                discovery.defaultLimit
              );

              processedModels.push({
                id: modelId,
                name,
                limit: limitResult.limit,
                reasoning: limitResult.reasoning
              });
            }

            // 保存到独立缓存
            const cacheDir = getCacheDir();
            if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
            fs.writeFileSync(
              path.join(cacheDir, `${providerId}-models.json`),
              JSON.stringify(processedModels, null, 2),
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
