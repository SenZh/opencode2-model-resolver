import { describe, expect, it } from "bun:test";
import {
  parseCachedModels,
  parseOldCachedModelsForFallback,
  buildCachedEntry,
  type CachedModelEntry,
} from "../src/index.js";

describe("缓存格式解析 (parseCachedModels & parseOldCachedModelsForFallback)", () => {
  it("TC-CACHE-V3-01: 正确解析新格式（schemaVersion: 3）", () => {
    const payload = JSON.stringify({
      schemaVersion: 3,
      updatedAt: Date.now(),
      models: [
        {
          id: "gpt-5.6-luna",
          name: "GPT 5.6 Luna",
          limit: { context: 1050000, output: 128000 },
          reasoning: true,
          capabilities: { tools: true, input: ["text"], output: ["text"] },
          cost: { input: 0.2, output: 1.2, cache_read: 0.02 },
        },
      ],
    });
    const models = parseCachedModels(payload);
    expect(models).not.toBeNull();
    expect(models!.length).toBe(1);
    expect(models![0].limit.context).toBe(1050000);
    expect(models![0].cost?.input).toBe(0.2);
    expect(models![0].cost?.cache_read).toBe(0.02);
  });

  it("TC-CACHE-V3-02: schemaVersion=2 的旧缓存在注入端判定为过期", () => {
    const payload = JSON.stringify({
      schemaVersion: 2,
      updatedAt: Date.now(),
      models: [{ id: "x", name: "X", limit: { context: 100, output: 100 } }],
    });
    expect(parseCachedModels(payload)).toBeNull();
  });

  it("TC-CACHE-V3-03: parseOldCachedModelsForFallback 兼容读取 schemaVersion=2 确保跨版本迁移断网防护", () => {
    const payload = JSON.stringify({
      schemaVersion: 2,
      updatedAt: Date.now(),
      models: [
        {
          id: "grok-4.7",
          name: "Grok 4.7",
          limit: { context: 500000, output: 500000 },
          reasoning: true,
          capabilities: { tools: true, input: ["text"], output: ["text"] },
        },
      ],
    });
    const fallback = parseOldCachedModelsForFallback(payload);
    expect(fallback).not.toBeNull();
    expect(fallback!.length).toBe(1);
    expect(fallback![0].limit.context).toBe(500000);
  });

  it("裸数组或版本 < 2 时 parseOldCachedModelsForFallback 返回 null", () => {
    expect(parseOldCachedModelsForFallback(JSON.stringify([{ id: "x" }]))).toBeNull();
    expect(parseOldCachedModelsForFallback(JSON.stringify({ schemaVersion: 1, models: [] }))).toBeNull();
  });
});

describe("双源独立字段级失败防护 (buildCachedEntry)", () => {
  const baseCaps = { tools: true, input: ["text"], output: ["text"] };
  const newEntry: CachedModelEntry = {
    id: "gpt-5.6-luna",
    name: "GPT 5.6 Luna",
    limit: { context: 131072, output: 16384 },
    reasoning: true,
    capabilities: baseCaps,
    cost: { input: 0.2, output: 1.2 },
  };
  const prevEntry: CachedModelEntry = {
    id: "gpt-5.6-luna",
    name: "GPT 5.6 Luna",
    limit: { context: 1050000, output: 128000 },
    reasoning: true,
    capabilities: baseCaps,
    cost: { input: 0.15, output: 1.0, cache_read: 0.01 },
  };

  it("TC-CACHE-V3-04: 双源异构防护 — modelsDev 可用，api 不可用", () => {
    // 场景：本次成功解析权威 limit，但 api 挂了未匹配到新 cost
    const entryWithoutCost: CachedModelEntry = {
      ...newEntry,
      limit: { context: 1050000, output: 128000 },
      cost: undefined,
    };
    const result = buildCachedEntry(
      entryWithoutCost,
      true,  // matchedModelsDev: true
      false, // matchedCost: false
      prevEntry,
      true,  // modelsDevAvailable: true
      false  // apiAvailable: false (价格源网络失败)
    );
    // limit 采用新权威值，cost 成功保护旧有效值
    expect(result.limit.context).toBe(1050000);
    expect(result.cost?.input).toBe(0.15);
    expect(result.cost?.cache_read).toBe(0.01);
  });

  it("TC-CACHE-V3-05: 双源异构防护 — modelsDev 不可用，api 可用", () => {
    // 场景：modelsDev 挂了（回落规则值），但 api 正常拉取并匹配到新 cost
    const entryWithRuleLimit: CachedModelEntry = {
      ...newEntry,
      limit: { context: 131072, output: 16384 },
      cost: { input: 0.2, output: 1.2 },
    };
    const result = buildCachedEntry(
      entryWithRuleLimit,
      false, // matchedModelsDev: false
      true,  // matchedCost: true
      prevEntry,
      false, // modelsDevAvailable: false
      true   // apiAvailable: true
    );
    // limit 继承旧有效值，cost 采用新匹配值
    expect(result.limit.context).toBe(1050000);
    expect(result.cost?.input).toBe(0.2);
  });

  it("TC-CACHE-V3-06: 价格源可用但该模型无价格条目 → 正常写入 undefined，不永久冻结旧值", () => {
    const entryNoCost: CachedModelEntry = {
      ...newEntry,
      cost: undefined,
    };
    const result = buildCachedEntry(
      entryNoCost,
      true,
      false, // matchedCost: false
      prevEntry,
      true,
      true   // apiAvailable: true（价格源正常）
    );
    expect(result.cost).toBeUndefined();
  });
});
