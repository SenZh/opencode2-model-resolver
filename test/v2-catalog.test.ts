import { describe, expect, it } from "bun:test";
import { injectV2Catalog } from "../src/catalog-injector.js";
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
    globalThis.fetch = (async () => {
      return {
        ok: true,
        json: async () => ({
          object: "list",
          data: [
            { id: "deepseek-chat" },
            { id: "qwen2.5-coder-32b" },
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
      expect(deepseek.limit.context).toBe(131072);
      expect(deepseek.limit.output).toBe(8192);

      const qwen = models?.get("qwen2.5-coder-32b");
      expect(qwen).toBeDefined();
      expect(qwen.limit.context).toBe(131072);

      expect(reloadCalled).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
