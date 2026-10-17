import { describe, expect, it } from "bun:test";
import {
  resolveProviderConfig,
  collectDiscoveryTargets,
} from "../src/rules/provider-config.js";

/** 构造一份完整的新格式 provider 条目 */
function v2Provider(overrides: Record<string, unknown> = {}) {
  return {
    name: "CPA",
    package: "aisdk:@ai-sdk/openai-compatible",
    settings: {
      baseURL: "https://a.com/v1",
      apiKey: "sk-x",
      modelsDiscovery: {
        enabled: true,
        endpoint: "/models",
        timeoutMs: 15000,
        modelInfoFormat: "models.dev",
        showProviderName: true,
      },
    },
    ...overrides,
  };
}

/** 构造一份完整的旧格式 provider 条目 */
function v1Provider(overrides: Record<string, unknown> = {}) {
  return {
    name: "CPA",
    npm: "@ai-sdk/openai-compatible",
    options: {
      baseURL: "https://a.com/v1",
      apiKey: "sk-x",
      modelsDiscovery: {
        enabled: true,
        endpoint: "/models",
        timeoutMs: 15000,
        modelInfoFormat: "models.dev",
        showProviderName: true,
      },
    },
    ...overrides,
  };
}

describe("resolveProviderConfig — 等价类", () => {
  it("TC-01: 新格式全字段解析", () => {
    const config = { providers: { p: v2Provider() } };
    const r = resolveProviderConfig("p", config);
    expect(r.found).toBe(true);
    expect(r.source).toBe("v2");
    expect(r.baseURL).toBe("https://a.com/v1");
    expect(r.apiKey).toBe("sk-x");
    expect(r.name).toBe("CPA");
    expect(r.discovery?.enabled).toBe(true);
    expect(r.discovery?.showProviderName).toBe(true);
  });

  it("TC-02: 旧格式全字段解析（与 TC-01 对照）", () => {
    const config = { provider: { p: v1Provider() } };
    const r = resolveProviderConfig("p", config);
    expect(r.found).toBe(true);
    expect(r.source).toBe("v1");
    expect(r.baseURL).toBe("https://a.com/v1");
    expect(r.apiKey).toBe("sk-x");
    expect(r.name).toBe("CPA");
    expect(r.discovery?.enabled).toBe(true);
    expect(r.discovery?.showProviderName).toBe(true);
  });

  it("TC-03: 两段同 id 且值冲突时取新格式", () => {
    const config = {
      providers: {
        p: v2Provider({ settings: { baseURL: "https://new", apiKey: "sk-new" } }),
      },
      provider: {
        p: v1Provider({ options: { baseURL: "https://old", apiKey: "sk-old" } }),
      },
    };
    const r = resolveProviderConfig("p", config);
    expect(r.source).toBe("v2");
    expect(r.baseURL).toBe("https://new");
    expect(r.apiKey).toBe("sk-new");
  });

  it("TC-15: G6 深度相等 — 同值新旧格式解析结果一致（除 source）", () => {
    const v2 = resolveProviderConfig("p", { providers: { p: v2Provider() } });
    const v1 = resolveProviderConfig("p", { provider: { p: v1Provider() } });
    expect({ ...v2, source: "x" }).toEqual({ ...v1, source: "x" });
  });

  it("TC-04: 新格式深层字段透传无丢失无改写", () => {
    const discovery = {
      enabled: true,
      endpoint: "/custom/models",
      timeoutMs: 1234,
      include: ["^gpt"],
      exclude: ["embedding"],
      rules: [{ match: "/gpt-5/i", limit: { context: 100, output: 50 }, reasoning: true }],
      defaultLimit: { context: 1, output: 2 },
      smartModelName: false,
      showProviderName: true,
      modelInfoFormat: "models.dev",
    };
    const config = {
      providers: { p: { name: "CPA", settings: { baseURL: "https://a", modelsDiscovery: discovery } } },
    };
    const r = resolveProviderConfig("p", config);
    expect(r.discovery).toEqual(discovery);
  });

  it("TC-11: 两段并存不同 id 时目标集为并集且去重、v2 在前", () => {
    const config = {
      providers: { a: v2Provider(), shared: v2Provider() },
      provider: { b: v1Provider(), shared: v1Provider() },
    };
    const targets = collectDiscoveryTargets(config);
    expect(targets.map((t) => t.providerId)).toEqual(["a", "shared", "b"]);
    expect(targets.find((t) => t.providerId === "shared")!.config.source).toBe("v2");
  });

  it("TC-17: 无 modelsDiscovery 的 provider 不产生 target", () => {
    const config = { providers: { p: { name: "X", settings: { baseURL: "https://a" } } } };
    expect(collectDiscoveryTargets(config)).toEqual([]);
  });
});

describe("resolveProviderConfig — 边界与异常", () => {
  it("TC-05: provider 存在但 settings 缺失", () => {
    const r = resolveProviderConfig("p", { providers: { p: { name: "X" } } });
    expect(r.found).toBe(true);
    expect(r.source).toBe("v2");
    expect(r.baseURL).toBe("");
    expect(r.apiKey).toBe("");
    expect(r.discovery).toBeUndefined();
  });

  it("TC-06: baseURL 多个尾斜杠全部去除", () => {
    const config = {
      providers: { p: { settings: { baseURL: "https://a.com/v1///" } } },
    };
    expect(resolveProviderConfig("p", config).baseURL).toBe("https://a.com/v1");
  });

  it("TC-07: name 为纯空白时回退 providerId", () => {
    const r = resolveProviderConfig("p", { providers: { p: { name: "   ", settings: {} } } });
    expect(r.name).toBe("p");
  });

  it("TC-07b: name 非字符串时回退 providerId", () => {
    const r = resolveProviderConfig("p", { providers: { p: { name: 123, settings: {} } } });
    expect(r.name).toBe("p");
  });

  it("TC-08: config 为 null 时不抛异常", () => {
    const r = resolveProviderConfig("p", null);
    expect(r.found).toBe(false);
    expect(r.source).toBe("none");
    expect(r.discovery).toBeUndefined();
  });

  it("TC-08b: config 为非对象（字符串/数组）时不抛异常", () => {
    expect(resolveProviderConfig("p", "not-json").found).toBe(false);
    expect(resolveProviderConfig("p", [1, 2]).found).toBe(false);
  });

  it("TC-09: enabled=false 的 provider 被过滤出目标集", () => {
    const config = {
      providers: {
        p: { settings: { baseURL: "https://a", modelsDiscovery: { enabled: false } } },
      },
    };
    expect(collectDiscoveryTargets(config)).toEqual([]);
  });

  it("TC-09b: enabled 缺省（未写）视为启用", () => {
    const config = {
      providers: { p: { settings: { baseURL: "https://a", modelsDiscovery: {} } } },
    };
    expect(collectDiscoveryTargets(config).map((t) => t.providerId)).toEqual(["p"]);
  });

  it("TC-10: 仅旧格式存在该 id 时 source=v1", () => {
    const r = resolveProviderConfig("p", { provider: { p: v1Provider() } });
    expect(r.source).toBe("v1");
  });

  it("TC-12: v2 有 provider 无 discovery、v1 有 discovery 时不生效（整段 v2 优先）", () => {
    const config = {
      providers: { p: { name: "X" } },
      provider: { p: v1Provider() },
    };
    const r = resolveProviderConfig("p", config);
    expect(r.source).toBe("v2");
    expect(r.discovery).toBeUndefined();
    expect(collectDiscoveryTargets(config)).toEqual([]);
  });

  it("TC-13: providers.<id> 为 null 时不抛异常、found=false", () => {
    const r = resolveProviderConfig("p", { providers: { p: null } });
    expect(r.found).toBe(false);
    expect(r.source).toBe("none");
  });

  it("TC-13b: providers 段为 null / 非对象时不抛异常", () => {
    expect(resolveProviderConfig("p", { providers: null }).found).toBe(false);
    expect(resolveProviderConfig("p", { providers: "x" }).found).toBe(false);
  });

  it("TC-14: modelsDiscovery 为非对象时视为无 discovery（V2 段）", () => {
    for (const value of [true, "yes", 42, ["a"], null]) {
      const r = resolveProviderConfig("p", {
        providers: { p: { settings: { baseURL: "https://a", modelsDiscovery: value } } },
      });
      expect(r.discovery).toBeUndefined();
      expect(collectDiscoveryTargets({
        providers: { p: { settings: { baseURL: "https://a", modelsDiscovery: value } } },
      })).toEqual([]);
    }
  });

  it("TC-14b: modelsDiscovery 为非对象时视为无 discovery（V1 段等价类）", () => {
    for (const value of [true, "yes", 42, ["a"], null]) {
      const config = {
        provider: { p: { options: { baseURL: "https://a", modelsDiscovery: value } } },
      };
      expect(resolveProviderConfig("p", config).discovery).toBeUndefined();
      expect(collectDiscoveryTargets(config)).toEqual([]);
    }
  });

  it("TC-21: discovery 字段类型错误时被逐字段丢弃（脏配置不透传）", () => {
    const r = resolveProviderConfig("p", {
      providers: {
        p: {
          settings: {
            baseURL: "https://a",
            modelsDiscovery: {
              enabled: true,
              endpoint: 42,            // 应为 string → 丢弃
              timeoutMs: "5000",       // 应为 number → 丢弃
              include: ["^gpt", 123],  // 混入非字符串 → 只保留字符串
              modelInfoFormat: true,   // 应为 string → 丢弃
            },
          },
        },
      },
    });
    expect(r.discovery).toEqual({ enabled: true, include: ["^gpt"] });
  });

  it("TC-22: baseURL 非字符串时不抛异常、返回空串（V1 行为变更）", () => {
    const config = {
      providers: { p: { settings: { baseURL: 12345, modelsDiscovery: { enabled: true } } } },
    };
    const r = resolveProviderConfig("p", config);
    expect(r.baseURL).toBe("");
    expect(r.apiKey).toBe("");
  });

  it("TC-16: settings 无 apiKey 时返回空串（不臆造、不读 IO）", () => {
    const r = resolveProviderConfig("p", { providers: { p: { settings: { baseURL: "https://a" } } } });
    expect(r.apiKey).toBe("");
  });

  it("TC-18: 空配置对象返回空目标集", () => {
    expect(collectDiscoveryTargets({})).toEqual([]);
    expect(collectDiscoveryTargets(null)).toEqual([]);
  });

  it("TC-19: 新格式 provider 无 name 时回退 providerId", () => {
    const r = resolveProviderConfig("my-prov", {
      providers: { "my-prov": { settings: { baseURL: "https://a" } } },
    });
    expect(r.name).toBe("my-prov");
  });

  it("TC-20: 真实用户配置形态（cpa 新格式）可解析出 discovery 与 baseURL", () => {
    const config = {
      providers: {
        cpa: {
          name: "CPA",
          package: "aisdk:@ai-sdk/openai-compatible",
          settings: {
            baseURL: "https://ai.codepower.cloud/v1",
            apiKey: "sk-m8Xyv3NIXlLmtf6UFg0mJCce0ydBG0FZnaFjb2Vc8HvUCcHf",
            modelsDiscovery: {
              enabled: true,
              timeoutMs: 15000,
              modelInfoFormat: "models.dev",
              showProviderName: true,
            },
          },
        },
      },
    };
    const targets = collectDiscoveryTargets(config);
    expect(targets.length).toBe(1);
    expect(targets[0].providerId).toBe("cpa");
    expect(targets[0].config.baseURL).toBe("https://ai.codepower.cloud/v1");
    expect(targets[0].config.name).toBe("CPA");
    expect(targets[0].config.discovery?.showProviderName).toBe(true);
  });
});
