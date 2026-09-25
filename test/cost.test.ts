import { describe, expect, it } from "bun:test";
import { buildCostIndex, type PreIndexedCostTables } from "../src/fetcher/models-dev-api.js";
import { resolveModelCost } from "../src/rules/cost.js";

describe("价格匹配解析器 (resolveModelCost)", () => {
  const mockApiData = {
    openai: {
      models: {
        "gpt-5.6-luna": {
          cost: { input: 0.2, output: 1.2, cache_read: 0.02 },
        },
        "gpt-4o": {
          cost: { input: 1.5, output: 5.0 },
        },
      },
    },
    deepinfra: {
      models: {
        "tencent/Hy3": {
          cost: { input: 0.13, output: 0.53, cache_read: 0.033 },
        },
        "proxy/gpt-4o": {
          cost: { input: 10.0, output: 20.0 },
        },
      },
    },
    xai: {
      models: {
        "grok-4.7": {
          cost: { input: 2.0, output: 6.0 },
        },
      },
    },
    custom: {
      models: {
        "free-model": {
          cost: { input: 0, output: 0 },
        },
        "model-1": {
          cost: { input: 1.0, output: 2.0 },
        },
        "invalid-neg": {
          cost: { input: -1.0, output: 2.0 },
        },
        "invalid-nan": {
          cost: { input: "free", output: null },
        },
      },
    },
  };

  const tables: PreIndexedCostTables = buildCostIndex(mockApiData);

  it("TC-COST-01: 官方原厂精确匹配", () => {
    const cost = resolveModelCost("gpt-5.6-luna", tables);
    expect(cost).toBeDefined();
    expect(cost?.input).toBe(0.2);
    expect(cost?.output).toBe(1.2);
    expect(cost?.cache_read).toBe(0.02);
    expect(cost?.cache_write).toBeUndefined();
  });

  it("TC-COST-02: 知名托管商全库尾段匹配", () => {
    const cost = resolveModelCost("hy3", tables);
    expect(cost).toBeDefined();
    expect(cost?.input).toBe(0.13);
    expect(cost?.output).toBe(0.53);
    expect(cost?.cache_read).toBe(0.033);
  });

  it("TC-COST-03: 变体前缀模糊匹配（带合法分隔符 -）", () => {
    const cost = resolveModelCost("grok-4.7-build-fast", tables);
    expect(cost).toBeDefined();
    expect(cost?.input).toBe(2.0);
    expect(cost?.output).toBe(6.0);
  });

  it("TC-COST-04: 前缀模糊匹配防误伤（非法无分隔符拒绝命中）", () => {
    // 存在 model-1，但目标是 model-11，中间缺少分隔符，严禁命中
    const cost = resolveModelCost("model-11", tables);
    expect(cost).toBeUndefined();
  });

  it("TC-COST-05: 免费模型 0 值定价等价类允许", () => {
    const cost = resolveModelCost("free-model", tables);
    expect(cost).toBeDefined();
    expect(cost?.input).toBe(0);
    expect(cost?.output).toBe(0);
  });

  it("TC-COST-06: 未知模型返回 undefined", () => {
    const cost = resolveModelCost("some-unknown-random-model", tables);
    expect(cost).toBeUndefined();
  });

  it("TC-COST-07: 价格源为 null (网络不可用) 安全降级", () => {
    const cost = resolveModelCost("gpt-5.6-luna", null);
    expect(cost).toBeUndefined();
  });

  it("TC-COST-08: 无效价格防御 (负数)", () => {
    const cost = resolveModelCost("invalid-neg", tables);
    expect(cost).toBeUndefined();
  });

  it("TC-COST-09: 无效价格防御 (非数字)", () => {
    const cost = resolveModelCost("invalid-nan", tables);
    expect(cost).toBeUndefined();
  });

  it("TC-COST-10: 官方白名单优先于聚合商代理", () => {
    const cost = resolveModelCost("gpt-4o", tables);
    expect(cost).toBeDefined();
    // 官方是 1.5/5.0，代理是 10/20，必须命中官方
    expect(cost?.input).toBe(1.5);
    expect(cost?.output).toBe(5.0);
  });

  it("TC-COST-11: 大小写混合 ID 正常命中", () => {
    const cost = resolveModelCost("GPT-5.6-Luna", tables);
    expect(cost).toBeDefined();
    expect(cost?.input).toBe(0.2);
  });

  it("TC-COST-12: 乱序场景下官方原厂前缀优先收录，不受第三方托管商抢占", () => {
    // 构造第三方排在最前面的乱序字典
    const reverseData = {
      untrusted_proxy: {
        models: {
          "proxy/grok-4.7": { cost: { input: 99, output: 999 } },
        },
      },
      xai: {
        models: {
          "grok-4.7": { cost: { input: 2.0, output: 6.0 } },
        },
      },
    };
    const reverseTables = buildCostIndex(reverseData);
    // 匹配 grok-4.7 变体
    const cost = resolveModelCost("grok-4.7-build-fast", reverseTables);
    expect(cost).toBeDefined();
    // 必须命中官方原厂 2.0/6.0，而非第三方的 99/999
    expect(cost?.input).toBe(2.0);
    expect(cost?.output).toBe(6.0);
  });
});
