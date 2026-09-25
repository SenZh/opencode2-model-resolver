import { describe, expect, it } from "bun:test";
import { resolveProviderModels } from "../src/index.js";
import { lookupModelsDev } from "../src/fetcher/models-dev.js";
import type { ModelsDevModel } from "../src/fetcher/models-dev.js";
import { buildCostIndex } from "../src/fetcher/models-dev-api.js";

function makeCache(entries: Record<string, ModelsDevModel>): Map<string, ModelsDevModel> {
  return new Map(Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v]));
}

/** 真实 models.dev 数据（2026-09 实测） */
const REAL_CACHE = makeCache({
  "openai/gpt-5.6-luna": {
    id: "openai/gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image", "pdf"], output: ["text"] },
    limit: { context: 1050000, input: 922000, output: 128000 },
  },
  "xai/grok-4.7": {
    id: "xai/grok-4.7",
    name: "Grok 4.7",
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image", "pdf"], output: ["text"] },
    limit: { context: 500000, output: 500000 },
  },
  "tencent/hy4-preview": {
    id: "tencent/hy4-preview",
    name: "Hy4 preview",
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text"], output: ["text"] },
    limit: { context: 1024000, output: 64000 },
  },
  "openai/gpt-image-2": {
    id: "openai/gpt-image-2",
    reasoning: false,
    tool_call: false,
    modalities: { input: ["text", "image"], output: ["image"] },
    limit: { context: 0, output: 0 },
  },
  "google/gemini-3.1-flash-image": {
    id: "google/gemini-3.1-flash-image",
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text", "image"] },
    limit: { context: 131072, output: 32768 },
  },
});

describe("扫描路径端到端 (resolveProviderModels)", () => {
  it("主路径-4: 三模型经扫描路径后 context 均为 models.dev 权威值", () => {
    const raw = [
      { id: "gpt-5.6-luna" },
      { id: "grok-4.7" },
      { id: "hy4-preview" },
    ];
    const models = resolveProviderModels(raw, REAL_CACHE, {});
    const byId = Object.fromEntries(models.map((m) => [m.id, m]));

    expect(byId["gpt-5.6-luna"].limit.context).toBe(1050000);
    expect(byId["gpt-5.6-luna"].limit.output).toBe(128000);
    expect(byId["grok-4.7"].limit.context).toBe(500000);
    expect(byId["hy4-preview"].limit.context).toBe(1024000);
  });

  it("扫描路径过滤非对话模型（embedding 等）", () => {
    const raw = [{ id: "gpt-5.6-luna" }, { id: "text-embedding-3" }];
    const models = resolveProviderModels(raw, REAL_CACHE, {});
    expect(models.length).toBe(1);
    expect(models[0].id).toBe("gpt-5.6-luna");
  });

  it("扫描路径展示名格式化与 provider 后缀", () => {
    const models = resolveProviderModels([{ id: "gpt-5.6-luna" }], REAL_CACHE, {
      shouldAppendProviderName: true,
      providerName: "CPA",
    });
    expect(models[0].name).toBe("GPT 5.6 Luna (CPA)");
  });

  it("P1-回归: 旧缓存 output=0 时不视为可用值，不固化", () => {
    const prev = [
      { id: "grok-4.7", name: "Grok 4.7", limit: { context: 500000, output: 0 } },
    ];
    // models.dev 不可用（空 Map），旧缓存 output=0 应视为不可用 → 写入新规则值
    const models = resolveProviderModels([{ id: "grok-4.7" }], new Map(), {}, prev);
    expect(models[0].limit.output).toBe(8192); // /grok/i 规则值，而非 0
  });

  it("TC-16: models.dev 不可用 + 旧缓存有效 → 保留旧值（含 capabilities 冻结）", () => {
    const prev = [
      {
        id: "gpt-5.6-luna",
        name: "GPT 5.6 Luna",
        limit: { context: 1050000, output: 128000 },
        reasoning: true,
        capabilities: { tools: true, input: ["text", "image", "pdf"], output: ["text"] },
      },
    ];
    const models = resolveProviderModels([{ id: "gpt-5.6-luna" }], new Map(), {}, prev);
    expect(models[0].limit.context).toBe(1050000);
    // 固化契约：captured capabilities 随整条保留（tech-design §3.4 显式接受）
    expect(models[0].capabilities).toEqual({
      tools: true,
      input: ["text", "image", "pdf"],
      output: ["text"],
    });
  });

  it("models.dev 可用但模型无条目 → 写入规则值，不冻结", () => {
    const prev = [
      { id: "hy3", name: "Hy3", limit: { context: 999, output: 999 } },
    ];
    const models = resolveProviderModels([{ id: "hy3" }], REAL_CACHE, {}, prev);
    expect(models[0].limit.context).toBe(131072); // FALLBACK，而非旧值 999
  });

  it("扫描结果结构可直接序列化为缓存 payload", () => {
    const models = resolveProviderModels([{ id: "grok-4.7" }], REAL_CACHE, {});
    const payload = JSON.stringify({ schemaVersion: 2, updatedAt: Date.now(), models });
    const parsed = JSON.parse(payload);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.models[0].limit.context).toBe(500000);
  });
});

describe("扫描路径端到端 — 过滤与能力", () => {
  it("TC-15: 纯生图模型经扫描被过滤", () => {
    const raw = [{ id: "gpt-image-2" }, { id: "gpt-5.6-luna" }];
    const models = resolveProviderModels(raw, REAL_CACHE, {});
    const ids = models.map((m) => m.id);
    expect(ids).not.toContain("gpt-image-2");
    expect(ids).toContain("gpt-5.6-luna");
  });

  it("TC-02: 多模态 image 模型（gemini-3.1-flash-image）保留", () => {
    const models = resolveProviderModels([{ id: "gemini-3.1-flash-image" }], REAL_CACHE, {});
    expect(models.length).toBe(1);
    expect(models[0].id).toBe("gemini-3.1-flash-image");
  });

  it("TC-07 端到端: models.dev 不可用时 gpt-image-2.5 被关键词兜底过滤", () => {
    const raw = [{ id: "gpt-image-2.5" }, { id: "deepseek-chat" }];
    const models = resolveProviderModels(raw, new Map(), {});
    const ids = models.map((m) => m.id);
    expect(ids).not.toContain("gpt-image-2.5");
    expect(ids).toContain("deepseek-chat");
  });

  it("边界-1b: models.dev 可用但该模型无条目时，同样被关键词兜底过滤", () => {
    // REAL_CACHE 非空（models.dev 可用），但 gpt-image-2.5 无条目
    const raw = [{ id: "gpt-image-2.5" }, { id: "gpt-5.6-luna" }];
    const models = resolveProviderModels(raw, REAL_CACHE, {});
    const ids = models.map((m) => m.id);
    expect(ids).not.toContain("gpt-image-2.5");
    expect(ids).toContain("gpt-5.6-luna");
  });

  it("边界-7: cache 仅含 flare 变体时，gpt-image-2.5 拿不到父条目（前缀匹配方向不适用）", () => {
    const flareOnly = makeCache({
      "openai/gpt-image-2.5-flare": {
        id: "openai/gpt-image-2.5-flare",
        modalities: { input: ["text", "image"], output: ["image"] },
        limit: { context: 0, output: 0 },
      },
    });
    // 直接验证 lookupModelsDev 行为（契约边界-7 要求）
    expect(lookupModelsDev("gpt-image-2.5", flareOnly)).toBeUndefined();
    // 端到端：该模型因无 devInfo 走关键词兜底被过滤
    const models = resolveProviderModels([{ id: "gpt-image-2.5" }], flareOnly, {});
    expect(models.map((m) => m.id)).not.toContain("gpt-image-2.5");
  });

  it("TC-05: 每条产出都含 capabilities 结构与布尔 reasoning", () => {
    const raw = [
      { id: "gpt-5.6-luna" },
      { id: "grok-4.7" },
      { id: "hy4-preview" },
      { id: "some-unknown-model-xyz" },
    ];
    const models = resolveProviderModels(raw, REAL_CACHE, {});
    expect(models.length).toBe(4);
    for (const m of models) {
      expect(typeof m.capabilities.tools).toBe("boolean");
      expect(Array.isArray(m.capabilities.input)).toBe(true);
      expect(Array.isArray(m.capabilities.output)).toBe(true);
      expect(m.reasoning === true || m.reasoning === false).toBe(true);
    }
  });

  it("TC-06 端到端: gpt-5.6-luna 的 capabilities 取自 models.dev", () => {
    const models = resolveProviderModels([{ id: "gpt-5.6-luna" }], REAL_CACHE, {});
    expect(models[0].capabilities.input).toEqual(["text", "image", "pdf"]);
    expect(models[0].capabilities.tools).toBe(true);
    expect(models[0].capabilities.output).toEqual(["text"]);
  });

  it("无 models.dev 数据的模型使用默认 capabilities", () => {
    const models = resolveProviderModels([{ id: "some-unknown-model-xyz" }], REAL_CACHE, {});
    expect(models[0].capabilities).toEqual({
      tools: false,
      input: ["text"],
      output: ["text"],
    });
  });

  it("TC-SCAN-COST-01: 扫描端到端产出附带官方参考 cost", () => {
    const mockApiData = {
      openai: {
        models: {
          "gpt-5.6-luna": { cost: { input: 0.2, output: 1.2, cache_read: 0.02 } },
        },
      },
      xai: {
        models: {
          "grok-4.7": { cost: { input: 2.0, output: 6.0 } },
        },
      },
    };
    const costTables = buildCostIndex(mockApiData);

    const raw = [{ id: "gpt-5.6-luna" }, { id: "grok-4.7" }];
    const models = resolveProviderModels(raw, REAL_CACHE, {}, undefined, costTables);
    const byId = Object.fromEntries(models.map((m) => [m.id, m]));

    expect(byId["gpt-5.6-luna"].cost).toBeDefined();
    expect(byId["gpt-5.6-luna"].cost?.input).toBe(0.2);
    expect(byId["gpt-5.6-luna"].cost?.output).toBe(1.2);
    expect(byId["gpt-5.6-luna"].cost?.cache_read).toBe(0.02);

    expect(byId["grok-4.7"].cost).toBeDefined();
    expect(byId["grok-4.7"].cost?.input).toBe(2.0);
    expect(byId["grok-4.7"].cost?.output).toBe(6.0);
  });
});
