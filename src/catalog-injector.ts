import { fetchRemoteModels } from "./fetcher/models-fetcher.js";
import { fetchModelsDevData, lookupModelsDev } from "./fetcher/models-dev.js";
import { formatSmartModelName, appendProviderNameToModelName, shouldIncludeModel } from "./rules/filter.js";
import { resolveModelLimit } from "./rules/limits-database.js";
import { modelCacheStore } from "./store/cache-store.js";
import fs from "fs";
import path from "path";
import os from "os";
import type {
  OpenCodeV2Context,
  PluginOptions,
  ProviderTarget,
  RawOpenAIModel,
} from "./types.js";

function debugLog(...args: any[]) {
  try {
    const dir = path.join(os.homedir(), ".cache", "opencode2-model-resolver");
    fs.mkdirSync(dir, { recursive: true });
    const logFile = path.join(dir, "runtime.log");
    const msg = `[${new Date().toISOString()}] [catalog] ${args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")}\n`;
    fs.appendFileSync(logFile, msg, "utf8");
  } catch {}
}

export interface ResolvedModelMeta {
  id: string;
  name: string;
  limit: {
    context: number;
    output: number;
    input?: number;
  };
  reasoning?: boolean;
  attachment?: boolean;
  modalities?: {
    input?: string[];
    output?: string[];
  };
}

/**
 * OpenCode 2 核心注入器：通过 ctx.model.transform / ctx.provider.transform / ctx.catalog.transform 动态注入模型及 Limits
 */
export async function injectV2Catalog(
  ctx: OpenCodeV2Context,
  targets: ProviderTarget[],
  options: PluginOptions
): Promise<void> {
  const modelsDevCache = await fetchModelsDevData();
  debugLog("Fetched modelsDevCache keys:", Object.keys(modelsDevCache || {}).length);

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
    debugLog(`正在解析 Provider [${providerID}] (${target.baseURL})...`);

    const modelMap: Record<string, ResolvedModelMeta> = {};

    // 1. 优先加载本地独立私有缓存（秒级冷启动与防断网兜底）
    const cached = await modelCacheStore.read(providerID);
    if (cached && typeof cached === "object") {
      for (const [mId, mData] of Object.entries(cached)) {
        if (mData && typeof mData === "object") {
          modelMap[mId] = mData as ResolvedModelMeta;
        }
      }
    }
    debugLog(`[${providerID}] cached models count:`, Object.keys(modelMap).length);

    // 2. 尝试向远程探测拉取最新模型
    let rawModels: RawOpenAIModel[] = [];
    try {
      rawModels = await fetchRemoteModels({
        baseURL: target.baseURL,
        apiKey: target.apiKey,
        endpoint: target.endpoint,
        headers: target.headers,
        timeoutMs: options.timeoutMs || 5000,
      });
      debugLog(`[${providerID}] remote fetched models count:`, rawModels.length);
    } catch (err: any) {
      debugLog(`[${providerID}] 探测失败:`, err?.message || err);
    }

    const filteredModels = rawModels.filter((m) =>
      shouldIncludeModel(
        m,
        target.include || options.include,
        target.exclude || options.exclude
      )
    );

    // 3. 计算每个模型的权威信息与 Limits
    for (const raw of filteredModels) {
      const modelID = raw.id;
      const devInfo = lookupModelsDev(modelID, modelsDevCache);
      const { limit: ruleLimit, reasoning: ruleReasoning } = resolveModelLimit(
        raw,
        options.rules,
        target.defaultLimit || options.defaultLimit
      );

      const context = devInfo?.limit?.context || ruleLimit.context;
      const output = devInfo?.limit?.output || ruleLimit.output;
      const input = devInfo?.limit?.input || ruleLimit.input;

      const existing = modelMap[modelID];
      let displayName =
        existing?.name ||
        devInfo?.name ||
        (options.smartModelName !== false ? formatSmartModelName(modelID) : modelID);

      if (shouldAppendProviderName) {
        displayName = appendProviderNameToModelName(displayName, providerName);
      }

      const meta: ResolvedModelMeta = {
        id: modelID,
        name: displayName,
        limit: {
          ...(existing?.limit || {}),
          context,
          output,
          ...(input ? { input } : {}),
        },
      };

      if (devInfo?.reasoning || (ruleReasoning && existing?.reasoning === undefined)) {
        meta.reasoning = true;
      }
      if (devInfo?.attachment !== undefined && existing?.attachment === undefined) {
        meta.attachment = devInfo.attachment;
      }
      if (devInfo?.modalities && !existing?.modalities) {
        meta.modalities = devInfo.modalities;
      }

      modelMap[modelID] = meta;
    }

    // 将解析出的最新数据保存到独立私有缓存
    if (Object.keys(modelMap).length > 0) {
      await modelCacheStore.save(providerID, modelMap);
    }

    debugLog(`[${providerID}] total resolved models:`, Object.keys(modelMap).length);

    // 4. OpenCode 2 原生方式：通过 ctx.model.transform 动态更新模型展示与 Limits
    if (ctx.model && typeof ctx.model.transform === "function") {
      debugLog(`Calling ctx.model.transform for [${providerID}]...`);
      await ctx.model.transform((editor: any) => {
        debugLog("inside ctx.model.transform editor keys:", Object.keys(editor || {}));
        for (const [mId, meta] of Object.entries(modelMap)) {
          editor.update(providerID, mId, (draft: any) => {
            if (!draft) return;
            draft.name = meta.name;
            draft.limit = {
              context: meta.limit.context,
              output: meta.limit.output,
              ...(meta.limit.input ? { input: meta.limit.input } : {}),
            };
            if (meta.reasoning) draft.reasoning = true;
            if (meta.attachment !== undefined) draft.attachment = meta.attachment;
            if (meta.modalities) draft.modalities = meta.modalities;
          });
        }
      });
    } else {
      debugLog("ctx.model.transform is not available!");
    }

    // 5. OpenCode 2 原生方式：通过 ctx.provider.transform 动态维护 provider 模型清单
    if (ctx.provider && typeof ctx.provider.transform === "function") {
      debugLog(`Calling ctx.provider.transform for [${providerID}]...`);
      await ctx.provider.transform((editor: any) => {
        debugLog("inside ctx.provider.transform editor keys:", Object.keys(editor || {}));
        if (!editor) return;
        if (typeof editor.update === "function") {
          editor.update(providerID, (prov: any) => {
            if (!prov.name && target.name) {
              prov.name = target.name;
            }
          });
        }
        if (editor.models && typeof editor.models.update === "function") {
          for (const [mId, meta] of Object.entries(modelMap)) {
            editor.models.update(providerID, mId, (mDraft: any) => {
              if (!mDraft) return;
              mDraft.name = meta.name;
              mDraft.limit = {
                context: meta.limit.context,
                output: meta.limit.output,
                ...(meta.limit.input ? { input: meta.limit.input } : {}),
              };
              if (meta.reasoning) mDraft.reasoning = true;
              if (meta.attachment !== undefined) mDraft.attachment = meta.attachment;
              if (meta.modalities) mDraft.modalities = meta.modalities;
            });
          }
        }
      });
    }

    // 6. 兼容旧版/测试 Mock 的 ctx.catalog.transform
    if (ctx.catalog && typeof ctx.catalog.transform === "function") {
      await ctx.catalog.transform((editor: any) => {
        if (editor.provider && typeof editor.provider.update === "function") {
          editor.provider.update(providerID, (provider: any) => {
            if (!provider.name && target.name) {
              provider.name = target.name;
            }
          });
        }
        if (editor.model && typeof editor.model.update === "function") {
          for (const [mId, meta] of Object.entries(modelMap)) {
            editor.model.update(providerID, mId, (model: any) => {
              model.name = meta.name;
              model.limit = {
                context: meta.limit.context,
                output: meta.limit.output,
                ...(meta.limit.input ? { input: meta.limit.input } : {}),
              };
              if (meta.reasoning) model.reasoning = true;
              if (meta.attachment !== undefined) model.attachment = meta.attachment;
              if (meta.modalities) model.modalities = meta.modalities;
            });
          }
        }
      });
    }

    debugLog(`Provider [${providerID}] 模型与上下文解析完成！`);
  }

  // 通知系统重新加载活跃的模型注册表
  if (ctx.model && typeof ctx.model.reload === "function") {
    try {
      await ctx.model.reload();
      debugLog("ctx.model.reload() invoked");
    } catch (err: any) {
      debugLog("ctx.model.reload() error:", err?.message || err);
    }
  }
  if (ctx.catalog && typeof ctx.catalog.reload === "function") {
    try {
      await ctx.catalog.reload();
      debugLog("ctx.catalog.reload() invoked");
    } catch {}
  }
}
