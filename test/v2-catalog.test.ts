import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// 隔离缓存目录：getCacheDir() 读取 USERPROFILE/HOME，测试期间指向临时目录，
// 避免污染用户真实的 ~/.cache/opencode2-model-resolver
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "oc2-v2-catalog-test-"));
const savedUserProfile = process.env.USERPROFILE;
const savedHome = process.env.HOME;

beforeAll(() => {
  process.env.USERPROFILE = tmpHome;
  process.env.HOME = tmpHome;
});

afterAll(() => {
  if (savedUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = savedUserProfile;
  if (savedHome === undefined) delete process.env.HOME;
  else process.env.HOME = savedHome;
  try {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  } catch {}
});

import { injectV2Catalog } from "../src/catalog-injector.js";
import { __resetModelsDevCacheForTest } from "../src/fetcher/models-dev.js";
import type { OpenCodeV2CatalogEditor, OpenCodeV2Context, ProviderTarget } from "../src/types.js";

describe("OpenCode 2 Catalog 注入器测试", () => {
  it("应成功调用 ctx.catalog.transform 注册模型及正确的 limits", async () => {
    const state: {
      providers: Map<string, any>;
      models: Map<string, Map<string, any>>;
    } = {
      providers: new Map(),
      models: new Map(),
    };

    const mockEditor: OpenCodeV2CatalogEditor = {
      provider: {
        list: () => Array.from(state.providers.values()),
        get: (id) => state.providers.get(id),
        update: (id, fn) => {
          let p = state.providers.get(id) || { id };
          fn(p);
          state.providers.set(id, p);
        },
        remove: (id) => state.providers.delete(id),
      },
      model: {
        get: (pId, mId) => state.models.get(pId)?.get(mId),
        update: (pId, mId, fn) => {
          let pModels = state.models.get(pId);
          if (!pModels) {
            pModels = new Map();
            state.models.set(pId, pModels);
          }
          let m = pModels.get(mId) || { id: mId, providerID: pId };
          fn(m);
          pModels.set(mId, m);
        },
        remove: (pId, mId) => state.models.get(pId)?.delete(mId),
      },
    };

    let reloadCalled = false;

    const mockCtx: OpenCodeV2Context = {
      catalog: {
        transform: async (fn) => {
          await fn(mockEditor);
        },
        reload: async () => {
          reloadCalled = true;
        },
      },
    };

    const originalFetch = globalThis.fetch;
    __resetModelsDevCacheForTest();
    globalThis.fetch = (async (url: any) => {
      const u = String(url);
      // models.dev 权威库：真实结构（provider/model → 模型对象）
      if (u.includes("models.dev")) {
        return {
          ok: true,
          json: async () => ({
            "openai/deepseek-chat": {
              id: "openai/deepseek-chat",
              name: "DeepSeek Chat",
              limit: { context: 655360, output: 65536 },
            },
          }),
        } as any;
      }
      // provider 的 /v1/models 端点
      return {
        ok: true,
        json: async () => ({
          object: "list",
          data: [
            { id: "deepseek-chat" }, // models.dev 有权威值 655360
            { id: "qwen2.5-coder-32b" }, // models.dev 无条目 → 规则库 131072
            { id: "text-embedding-3" }, // 应被过滤
          ],
        }),
      } as any;
    }) as any;

    try {
      const targets: ProviderTarget[] = [
        {
          id: "local-vllm",
          name: "Local vLLM",
          baseURL: "http://127.0.0.1:8000/v1",
        },
      ];

      await injectV2Catalog(mockCtx, targets, {});

      const prov = state.providers.get("local-vllm");
      expect(prov).toBeDefined();
      expect(prov.name).toBe("Local vLLM");

      const models = state.models.get("local-vllm");
      expect(models).toBeDefined();
      expect(models?.size).toBe(2);

      const deepseek = models?.get("deepseek-chat");
      expect(deepseek).toBeDefined();
      // 应取 models.dev 权威值 655360，而非规则库的 131072 —— 证明 models.dev 层生效
      expect(deepseek.limit.context).toBe(655360);
      expect(deepseek.limit.output).toBe(65536);

      const qwen = models?.get("qwen2.5-coder-32b");
      expect(qwen).toBeDefined();
      expect(qwen.limit.context).toBe(131072);

      expect(reloadCalled).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("当开启 showProviderName 时，模型名称后应追加 (providerName) 且模型 id 不变", async () => {
    const state: {
      providers: Map<string, any>;
      models: Map<string, Map<string, any>>;
    } = {
      providers: new Map(),
      models: new Map(),
    };

    const mockEditor: OpenCodeV2CatalogEditor = {
      provider: {
        list: () => Array.from(state.providers.values()),
        get: (id) => state.providers.get(id),
        update: (id, fn) => {
          let p = state.providers.get(id) || { id };
          fn(p);
          state.providers.set(id, p);
        },
        remove: (id) => state.providers.delete(id),
      },
      model: {
        get: (pId, mId) => state.models.get(pId)?.get(mId),
        update: (pId, mId, fn) => {
          let pModels = state.models.get(pId);
          if (!pModels) {
            pModels = new Map();
            state.models.set(pId, pModels);
          }
          let m = pModels.get(mId) || { id: mId, providerID: pId };
          fn(m);
          pModels.set(mId, m);
        },
        remove: (pId, mId) => state.models.get(pId)?.delete(mId),
      },
    };

    const mockCtx: OpenCodeV2Context = {
      catalog: {
        transform: async (fn) => {
          await fn(mockEditor);
        },
        reload: async () => {},
      },
    };

    const originalFetch = globalThis.fetch;
    __resetModelsDevCacheForTest();
    globalThis.fetch = (async (url: any) => {
      const u = String(url);
      if (u.includes("models.dev")) {
        return { ok: true, json: async () => ({}) } as any;
      }
      return {
        ok: true,
        json: async () => ({
          object: "list",
          data: [{ id: "deepseek-chat" }],
        }),
      } as any;
    }) as any;

    try {
      const targets: ProviderTarget[] = [
        {
          id: "custom-relay",
          name: "My Relay",
          baseURL: "http://127.0.0.1:8000/v1",
          showProviderName: true,
        },
      ];

      await injectV2Catalog(mockCtx, targets, {});

      const models = state.models.get("custom-relay");
      expect(models).toBeDefined();
      const deepseek = models?.get("deepseek-chat");
      expect(deepseek).toBeDefined();
      // 模型 id 必须完全保持不变
      expect(deepseek.id).toBe("deepseek-chat");
      // 模型 name 必须带有 (My Relay)
      expect(deepseek.name).toBe("Deepseek Chat (My Relay)");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
