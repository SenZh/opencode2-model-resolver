import { fetchRemoteModels } from "./fetcher/models-fetcher.js";
import { fetchModelsDevData, lookupModelsDev } from "./fetcher/models-dev.js";
import { formatSmartModelName, appendProviderNameToModelName, shouldIncludeModel } from "./rules/filter.js";
import { resolveAuthoritativeLimit } from "./rules/limits-database.js";
import { modelCacheStore } from "./store/cache-store.js";
import type { PluginOptions, ProviderTarget, RawOpenAIModel } from "./types.js";

/**
 * OpenCode 1 兼容注入器：纯内存（In-Memory）动态合并配置，绝不回写污染磁盘文件
 */
export async function injectV1Config(
  config: any,
  targets: ProviderTarget[],
  options: PluginOptions
): Promise<void> {
  if (!config || typeof config !== "object") return;

  if (!config.provider) {
    config.provider = {};
  }

  // 预热 models.dev 权威数据库
  const modelsDevCache = await fetchModelsDevData();

  for (const target of targets) {
    const providerID = target.id;
    const providerName = (typeof target.name === "string" && target.name.trim())
      ? target.name.trim()
      : providerID;
    const shouldAppendProviderName = Boolean(
      target.showProviderName ||
      target.appendProviderName ||
      options.showProviderName ||
      options.appendProviderName
    );

    if (!config.provider[providerID]) {
      config.provider[providerID] = {
        npm: "@ai-sdk/openai-compatible",
        name: target.name || providerID,
        options: {
          baseURL: target.baseURL,
        },
        models: {},
      };
    }

    const providerObj = config.provider[providerID];
    const explicitModels = providerObj.models || {};
    const memoryModels: Record<string, any> = {};

    // 1. 尝试从独立私有缓存加载历史发现的模型（秒开保障）
    const cachedModels = await modelCacheStore.read(providerID);
    if (cachedModels && typeof cachedModels === "object") {
      Object.assign(memoryModels, cachedModels);
    }

    // 2. 对静态配置中已声明的模型进行内存合并与 limit 智能补全
    for (const [mId, mConf] of Object.entries(explicitModels)) {
      const existing: any = (mConf && typeof mConf === "object") ? { ...mConf } : {};
      const devInfo = lookupModelsDev(mId, modelsDevCache);
      const authoritative = resolveAuthoritativeLimit(
        { id: mId },
        {
          modelsDevCache,
          rules: options.rules,
          defaultLimit: target.defaultLimit || options.defaultLimit,
        }
      );

      const context = authoritative.limit.context;
      const output = authoritative.limit.output;
      const input = authoritative.limit.input;

      existing.name = existing.name || devInfo?.name || formatSmartModelName(mId);
      existing.limit = {
        context,
        output,
        ...(input ? { input } : {}),
        ...(existing.limit || {}),
      };

      if (devInfo?.reasoning || (authoritative.reasoning && existing.reasoning === undefined)) {
        existing.reasoning = true;
      }
      if (devInfo?.attachment !== undefined && existing.attachment === undefined) {
        existing.attachment = devInfo.attachment;
      }
      if (devInfo?.modalities && !existing.modalities) {
        existing.modalities = devInfo.modalities;
      }

      memoryModels[mId] = existing;
    }

    // 3. 向远程接口动态探测并发现新模型
    try {
      const rawModels: RawOpenAIModel[] = await fetchRemoteModels({
        baseURL: target.baseURL,
        apiKey: target.apiKey,
        endpoint: target.endpoint,
        headers: target.headers,
        timeoutMs: options.timeoutMs || 4000,
      });

      const filteredModels = rawModels.filter((m) =>
        shouldIncludeModel(
          m,
          target.include || options.include,
          target.exclude || options.exclude
        )
      );

      for (const raw of filteredModels) {
        const modelId = raw.id;
        const devInfo = lookupModelsDev(modelId, modelsDevCache);
        const authoritative = resolveAuthoritativeLimit(raw, {
          modelsDevCache,
          rules: options.rules,
          defaultLimit: target.defaultLimit || options.defaultLimit,
        });

        const context = authoritative.limit.context;
        const output = authoritative.limit.output;
        const input = authoritative.limit.input;

        const existing = memoryModels[modelId] || {};
        let displayName =
          existing.name ||
          devInfo?.name ||
          (options.smartModelName !== false ? formatSmartModelName(modelId) : modelId);

        if (shouldAppendProviderName) {
          displayName = appendProviderNameToModelName(displayName, providerName);
        }

        memoryModels[modelId] = {
          ...existing,
          name: displayName,
          limit: {
            context,
            output,
            ...(input ? { input } : {}),
            ...(existing.limit || {}),
          },
        };

        if (devInfo?.reasoning || (authoritative.reasoning && memoryModels[modelId].reasoning === undefined)) {
          memoryModels[modelId].reasoning = true;
        }
        if (devInfo?.attachment !== undefined && memoryModels[modelId].attachment === undefined) {
          memoryModels[modelId].attachment = devInfo.attachment;
        }
        if (devInfo?.modalities && !memoryModels[modelId].modalities) {
          memoryModels[modelId].modalities = devInfo.modalities;
        }
      }

      // 将发现的新数据落入私有缓存（绝不触碰 opencode.json）
      await modelCacheStore.save(providerID, memoryModels);
    } catch (err: any) {
      // 远程探测失败时，已有缓存和静态声明依然能够保证正常工作
    }

    // 4. 将全量模型直接挂载至内存中的 provider 对象
    providerObj.models = memoryModels;
  }
}
