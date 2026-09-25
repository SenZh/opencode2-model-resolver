import { describe, expect, it } from "bun:test";
import { parseCachedModels, buildCachedEntry } from "../src/index.js";

describe("缓存格式解析 (parseCachedModels)", () => {
  it("TC-11: 正确解析新格式（schemaVersion:2）", () => {
    const payload = JSON.stringify({
      schemaVersion: 2,
      updatedAt: Date.now(),
      models: [{ id: "gpt-5.6-luna", name: "GPT 5.6 Luna", limit: { context: 1050000, output: 128000 } }],
    });
    const models = parseCachedModels(payload);
    expect(models).not.toBeNull();
    expect(models!.length).toBe(1);
    expect(models![0].limit.context).toBe(1050000);
  });

  it("TC-11b: schemaVersion=1 的旧缓存判定为过期", () => {
    const payload = JSON.stringify({
      schemaVersion: 1,
      updatedAt: Date.now(),
      models: [{ id: "x", name: "X", limit: { context: 100, output: 100 } }],
    });
    expect(parseCachedModels(payload)).toBeNull();
  });

  it("TC-10: 旧格式（裸数组）判定为过期并返回 null", () => {
    const legacy = JSON.stringify([
      { id: "gpt-5.6-luna", name: "GPT 5.6 Luna", limit: { context: 131072, output: 16384 } },
    ]);
    expect(parseCachedModels(legacy)).toBeNull();
  });

  it("TC-10b: 版本号不符时返回 null", () => {
    const payload = JSON.stringify({ schemaVersion: 99, models: [] });
    expect(parseCachedModels(payload)).toBeNull();
  });

  it("TC-10c: 损坏 JSON 不抛异常，返回 null", () => {
    expect(parseCachedModels("{ not valid json")).toBeNull();
    expect(parseCachedModels("")).toBeNull();
  });

  it("TC-10d: models 字段非数组时返回 null", () => {
    const payload = JSON.stringify({ schemaVersion: 1, models: { foo: "bar" } });
    expect(parseCachedModels(payload)).toBeNull();
  });

  it("字符串型 schemaVersion 应判定为不符（严格相等）", () => {
    const payload = JSON.stringify({ schemaVersion: "1", models: [] });
    expect(parseCachedModels(payload)).toBeNull();
  });

  it("models 为 null 时返回 null", () => {
    const payload = JSON.stringify({ schemaVersion: 1, models: null });
    expect(parseCachedModels(payload)).toBeNull();
  });

  it("顶层为 null 或数组时返回 null", () => {
    expect(parseCachedModels("null")).toBeNull();
    expect(parseCachedModels("[]")).toBeNull();
  });
});

describe("字段级失败防护 (buildCachedEntry)", () => {
  const newEntry = {
    id: "gpt-5.6-luna",
    name: "GPT 5.6 Luna",
    limit: { context: 131072, output: 16384 },
  };
  const prevEntry = {
    id: "gpt-5.6-luna",
    name: "GPT 5.6 Luna",
    limit: { context: 1050000, output: 128000 },
  };

  it("TC-08: models.dev 不可用 + 旧缓存有可用值 → 保留旧值", () => {
    const result = buildCachedEntry(newEntry, false, prevEntry, false);
    expect(result.limit.context).toBe(1050000);
    expect(result).toBe(prevEntry);
  });

  it("TC-09: models.dev 不可用 + 旧缓存无该模型 → 写入本次结果（不冻结）", () => {
    const result = buildCachedEntry(newEntry, false, undefined, false);
    expect(result.limit.context).toBe(131072);
  });

  it("P0-回归: models.dev 可用但该模型本无条目 → 正常写入新规则值，不冻结旧值", () => {
    // 场景：hy3 / gpt-image-* 等永不在 models.dev 中的模型，规则库更新后必须能刷新
    const result = buildCachedEntry(newEntry, false, prevEntry, true);
    expect(result).toBe(newEntry);
    expect(result.limit.context).toBe(131072);
  });

  it("本次有权威值 → 始终采用新值，即使旧值不同", () => {
    const authEntry = {
      id: "gpt-5.6-luna",
      name: "GPT 5.6 Luna",
      limit: { context: 1050000, output: 128000 },
    };
    const result = buildCachedEntry(authEntry, true, newEntry, true);
    expect(result.limit.context).toBe(1050000);
  });

  it("旧缓存 context 为 0 时不视为可用值，仍采用新值", () => {
    const prevZero = {
      id: "gpt-image-2",
      name: "GPT Image 2",
      limit: { context: 0, output: 0 },
    };
    const result = buildCachedEntry(newEntry, false, prevZero, false);
    expect(result.limit.context).toBe(131072);
  });

  it("P1-回归: 旧缓存 output=0 时不视为可用值，仍采用新值", () => {
    const prevBadOutput = {
      id: "grok-4.7",
      name: "Grok 4.7",
      limit: { context: 500000, output: 0 },
    };
    const result = buildCachedEntry(newEntry, false, prevBadOutput, false);
    expect(result).toBe(newEntry);
  });

  it("旧缓存 limit 整体缺失时不视为可用值", () => {
    const prevNoLimit = { id: "grok-4.7", name: "Grok 4.7" } as any;
    const result = buildCachedEntry(newEntry, false, prevNoLimit, false);
    expect(result).toBe(newEntry);
  });
});
