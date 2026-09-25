import { describe, expect, it } from "bun:test";
import { resolveAuthoritativeLimit } from "../src/rules/limits-database.js";
import type { ModelsDevModel } from "../src/fetcher/models-dev.js";

/** 构造 models.dev 缓存 Map，key 为小写 "provider/model" */
function makeCache(entries: Record<string, ModelsDevModel>): Map<string, ModelsDevModel> {
  return new Map(Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v]));
}

/** 真实 models.dev 数据（2026-09 实测） */
const REAL_CACHE = makeCache({
  "openai/gpt-5.6-luna": {
    id: "openai/gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    reasoning: true,
    limit: { context: 1050000, input: 922000, output: 128000 },
  },
  "xai/grok-4.7": {
    id: "xai/grok-4.7",
    name: "Grok 4.7",
    reasoning: true,
    limit: { context: 500000, output: 500000 },
  },
  "tencent/hy4-preview": {
    id: "tencent/hy4-preview",
    name: "Hy4 preview",
    reasoning: true,
    limit: { context: 1024000, output: 64000 },
  },
});

describe("resolveAuthoritativeLimit — models.dev 优先合并", () => {
  it("TC-01: gpt-5.6-luna 应采用 models.dev 权威值 1050000", () => {
    const res = resolveAuthoritativeLimit({ id: "gpt-5.6-luna" }, { modelsDevCache: REAL_CACHE });
    expect(res.limit.context).toBe(1050000);
    expect(res.limit.output).toBe(128000);
    expect(res.matchedModelsDev).toBe(true);
  });

  it("TC-02: grok-4.7 应采用 models.dev 权威值 500000", () => {
    const res = resolveAuthoritativeLimit({ id: "grok-4.7" }, { modelsDevCache: REAL_CACHE });
    expect(res.limit.context).toBe(500000);
    expect(res.matchedModelsDev).toBe(true);
  });

  it("TC-03: hy4-preview 应采用 models.dev 权威值 1024000", () => {
    const res = resolveAuthoritativeLimit({ id: "hy4-preview" }, { modelsDevCache: REAL_CACHE });
    expect(res.limit.context).toBe(1024000);
    expect(res.limit.output).toBe(64000);
    expect(res.matchedModelsDev).toBe(true);
  });

  it("TC-05: 命中且 limit 有效时 matchedModelsDev 为 true；未命中为 false", () => {
    expect(
      resolveAuthoritativeLimit({ id: "gpt-5.6-luna" }, { modelsDevCache: REAL_CACHE }).matchedModelsDev
    ).toBe(true);
    expect(
      resolveAuthoritativeLimit({ id: "some-unknown-model-xyz" }, { modelsDevCache: REAL_CACHE }).matchedModelsDev
    ).toBe(false);
  });

  it("input 字段应透传 models.dev 的值", () => {
    const res = resolveAuthoritativeLimit({ id: "gpt-5.6-luna" }, { modelsDevCache: REAL_CACHE });
    expect(res.limit.input).toBe(922000);
  });
});

describe("resolveAuthoritativeLimit — 边界与异常", () => {
  it("TC-06: models.dev 返回 0 视为无效，回落规则值（不被 0 吞掉）", () => {
    const cache = makeCache({
      "openai/gpt-image-2": { id: "openai/gpt-image-2", limit: { context: 0, output: 0 } },
    });
    const res = resolveAuthoritativeLimit({ id: "gpt-image-2" }, { modelsDevCache: cache });
    // 规则库无 gpt-image 规则 → FALLBACK 131072，而非 0
    expect(res.limit.context).toBe(131072);
    expect(res.limit.context).not.toBe(0);
    expect(res.matchedModelsDev).toBe(false);
  });

  it("TC-07: 空 Map 时不抛异常，回落规则值，matchedModelsDev=false", () => {
    const res = resolveAuthoritativeLimit({ id: "gpt-5.6-luna" }, { modelsDevCache: new Map() });
    expect(res.limit.context).toBe(131072); // /gpt-5/i 规则值
    expect(res.matchedModelsDev).toBe(false);
  });

  it("TC-07b: 未提供 cache 时同空 Map 行为", () => {
    const res = resolveAuthoritativeLimit({ id: "grok-4.7" });
    expect(res.limit.context).toBe(131072); // /grok/i 规则值
    expect(res.matchedModelsDev).toBe(false);
  });

  it("TC-12: models.dev 命中 context 但 output=0 时，output 回落规则值", () => {
    const cache = makeCache({
      "xai/grok-4.7": { id: "xai/grok-4.7", limit: { context: 500000, output: 0 } },
    });
    const res = resolveAuthoritativeLimit({ id: "grok-4.7" }, { modelsDevCache: cache });
    expect(res.limit.context).toBe(500000); // context 采用 models.dev
    expect(res.limit.output).toBe(8192); // /grok/i 规则值
    expect(res.matchedModelsDev).toBe(true);
  });

  it("TC-13: models.dev 命中但 limit 整个缺失时，全字段回落，matchedModelsDev=false", () => {
    const cache = makeCache({
      "xai/grok-4.7": { id: "xai/grok-4.7", name: "Grok 4.7" },
    });
    const res = resolveAuthoritativeLimit({ id: "grok-4.7" }, { modelsDevCache: cache });
    expect(res.limit.context).toBe(131072);
    expect(res.limit.output).toBe(8192);
    expect(res.matchedModelsDev).toBe(false);
  });

  it("P1-回归: context=0 但 output>0 时 matchedModelsDev 应为 true（任一字段命中）", () => {
    const cache = makeCache({
      "xai/grok-4.7": { id: "xai/grok-4.7", limit: { context: 0, output: 50000 } },
    });
    const res = resolveAuthoritativeLimit({ id: "grok-4.7" }, { modelsDevCache: cache });
    expect(res.limit.context).toBe(131072); // context 0 无效，回落规则
    expect(res.limit.output).toBe(50000); // output 权威
    expect(res.matchedModelsDev).toBe(true); // 不应因 context=0 而误判为未命中
  });

  it("模型名带 :free 等后缀时仍应命中 models.dev", () => {
    const res = resolveAuthoritativeLimit({ id: "grok-4.7:free" }, { modelsDevCache: REAL_CACHE });
    expect(res.limit.context).toBe(500000);
  });

  it("应透传用户自定义 rules", () => {
    const res = resolveAuthoritativeLimit(
      { id: "special-model" },
      {
        modelsDevCache: new Map(),
        rules: [{ match: "^special-model", limit: { context: 524288, output: 32768 } }],
      }
    );
    expect(res.limit.context).toBe(524288);
    expect(res.limit.output).toBe(32768);
  });
});
