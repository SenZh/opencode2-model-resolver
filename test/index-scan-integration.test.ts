import { describe, expect, it, beforeAll, afterAll, beforeEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { __resetModelsDevCacheForTest } from "../src/fetcher/models-dev.js";
import { __resetModelsDevApiCacheForTest } from "../src/fetcher/models-dev-api.js";

// 隔离 home，避免触碰用户真实环境
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "oc2-scan-int-"));
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

// 动态导入以确保环境变量先生效
const { default: plugin } = await import("../src/index.js");

const configPath = path.join(tmpHome, ".config", "opencode", "opencode.json");
const cacheDir = path.join(tmpHome, ".cache", "opencode2-model-resolver");

/** 哨兵 provider：保证扫描确实执行到（作为「扫描已完成」的确定性信号） */
const SENTINEL_HOST = "sentinel.example.com";

interface CapturedRequest {
  url: string;
  authorization?: string;
}

/**
 * 装载 config（自动追加哨兵 provider）并执行一次 setup。
 *
 * 等待策略：轮询直到**哨兵请求**出现（确定性信号），而非等待总数——因为
 * models.dev 拉取会先于 provider 扫描发生，按总数轮询会在扫描尚未执行时误判完成。
 */
async function runSetupAndCapture(
  config: Record<string, any>,
  fetchImpl: (url: string, init?: any) => Promise<any>
): Promise<CapturedRequest[]> {
  const withSentinel = {
    ...config,
    providers: {
      ...(config.providers || {}),
      __sentinel__: {
        name: "Sentinel",
        settings: {
          baseURL: `https://${SENTINEL_HOST}/v1`,
          modelsDiscovery: { enabled: true, timeoutMs: 5000 },
        },
      },
    },
  };

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(withSentinel), "utf8");

  const captured: CapturedRequest[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    captured.push({ url, authorization: init?.headers?.["Authorization"] });
    return fetchImpl(url, init);
  }) as any;

  try {
    const mockCtx: any = {
      provider: {
        transform: () => Promise.resolve({ dispose: async () => {} }),
        reload: async () => {},
      },
    };
    plugin.setup(mockCtx);

    // 轮询等待哨兵请求出现（= 扫描循环已执行到末尾）
    const deadline = Date.now() + 20000;
    const sentinelSeen = () => captured.some((c) => c.url.includes(SENTINEL_HOST));
    while (!sentinelSeen() && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!sentinelSeen()) throw new Error("扫描未到达哨兵 provider，测试无法确定扫描已完成");
    // 哨兵之后同批 target 均已在同一循环内处理完毕，稍作等待确保缓存落盘
    await new Promise((r) => setTimeout(r, 200));
    return captured;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function okJson(payload: unknown) {
  return async () => ({ ok: true, status: 200, json: async () => payload });
}

beforeEach(() => {
  try {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  } catch {}
  // 清空模块级单例缓存，避免跨用例/跨文件串扰
  __resetModelsDevCacheForTest();
  __resetModelsDevApiCacheForTest();
});

describe("扫描路径集成 — 两段配置驱动 (TC-SCAN)", () => {
  it("TC-SCAN-V2: 新格式 settings 驱动扫描，URL 与鉴权头正确，缓存写出", async () => {
    const config = {
      providers: {
        "scan-v2": {
          name: "V2 Prov",
          package: "aisdk:@ai-sdk/openai-compatible",
          settings: {
            baseURL: "https://v2.example.com/v1",
            apiKey: "sk-v2-key",
            modelsDiscovery: { enabled: true, timeoutMs: 5000 },
          },
        },
      },
    };
    const captured = await runSetupAndCapture(
      config,
      okJson({ data: [{ id: "gpt-5.6-luna" }, { id: "grok-4.7" }] })
    );

    const scanReqs = captured.filter((c) => c.url.includes("v2.example.com"));
    expect(scanReqs.length).toBe(1);
    expect(scanReqs[0].url).toBe("https://v2.example.com/v1/models");
    expect(scanReqs[0].authorization).toBe("Bearer sk-v2-key");

    const cacheFile = path.join(cacheDir, "scan-v2-models.json");
    expect(fs.existsSync(cacheFile)).toBe(true);
    const payload = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    expect(payload.schemaVersion).toBe(3);
    expect(payload.models.map((m: any) => m.id)).toContain("gpt-5.6-luna");
    expect(payload.models.map((m: any) => m.id)).toContain("grok-4.7");
  });

  it("TC-SCAN-V1: 旧格式 options 驱动扫描（不回归）", async () => {
    const config = {
      provider: {
        "scan-v1": {
          name: "V1 Prov",
          npm: "@ai-sdk/openai-compatible",
          options: {
            baseURL: "https://v1.example.com/v1",
            apiKey: "sk-v1-key",
            modelsDiscovery: { enabled: true, timeoutMs: 5000 },
          },
        },
      },
    };
    const captured = await runSetupAndCapture(
      config,
      okJson({ data: [{ id: "grok-4.7" }] })
    );

    const scanReqs = captured.filter((c) => c.url.includes("v1.example.com"));
    expect(scanReqs.length).toBe(1);
    expect(scanReqs[0].url).toBe("https://v1.example.com/v1/models");
    expect(scanReqs[0].authorization).toBe("Bearer sk-v1-key");

    const cacheFile = path.join(cacheDir, "scan-v1-models.json");
    expect(fs.existsSync(cacheFile)).toBe(true);
  });

  it("TC-SCAN-SKIP: settings 缺失 baseURL 时不发请求、不崩溃", async () => {
    const config = {
      providers: {
        "scan-skip": {
          name: "NoURL",
          settings: { modelsDiscovery: { enabled: true } },
        },
      },
    };
    // 哨兵请求出现 = 扫描已执行到末尾，此时仍未发出 scan-skip 请求即为「正确跳过」
    const captured = await runSetupAndCapture(config, okJson({ data: [] }));
    expect(captured.filter((c) => c.url.includes("scan-skip")).length).toBe(0);
    expect(fs.existsSync(path.join(cacheDir, "scan-skip-models.json"))).toBe(false);
  });

  it("TC-SCAN-ENABLED-FALSE: enabled=false 时不发请求", async () => {
    const config = {
      providers: {
        "scan-off": {
          settings: {
            baseURL: "https://off.example.com/v1",
            modelsDiscovery: { enabled: false },
          },
        },
      },
    };
    const captured = await runSetupAndCapture(config, okJson({ data: [] }));
    expect(captured.filter((c) => c.url.includes("off.example.com")).length).toBe(0);
  });

  it("TC-SCAN-V2-NONDISCOVERY: v2 有 provider 无 discovery、v1 有 discovery 时不发请求（整段 v2 优先）", async () => {
    const config = {
      providers: { "scan-prio": { name: "X" } },
      provider: {
        "scan-prio": {
          name: "Y",
          options: {
            baseURL: "https://prio.example.com/v1",
            modelsDiscovery: { enabled: true },
          },
        },
      },
    };
    const captured = await runSetupAndCapture(config, okJson({ data: [] }));
    expect(captured.filter((c) => c.url.includes("prio.example.com")).length).toBe(0);
  });

  it("TC-SCAN-DISPLAY: 新格式 provider 展示名后缀生效", async () => {
    const config = {
      providers: {
        "scan-name": {
          name: "MyProv",
          settings: {
            baseURL: "https://name.example.com/v1",
            modelsDiscovery: { enabled: true, showProviderName: true },
          },
        },
      },
    };
    await runSetupAndCapture(config, okJson({ data: [{ id: "grok-4.7" }] }));

    const payload = JSON.parse(
      fs.readFileSync(path.join(cacheDir, "scan-name-models.json"), "utf8")
    );
    expect(payload.models[0].name).toBe("Grok 4.7 (MyProv)");
  });

  it("TC-SCAN-APIKEY-FALLBACK: settings 无 apiKey 时回退 auth.json 凭据", async () => {
    const authDir = path.join(tmpHome, ".local", "share", "opencode");
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(
      path.join(authDir, "auth.json"),
      JSON.stringify({ "scan-fallback": { key: "sk-from-auth" } }),
      "utf8"
    );

    const config = {
      providers: {
        "scan-fallback": {
          settings: {
            baseURL: "https://fallback.example.com/v1",
            modelsDiscovery: { enabled: true, timeoutMs: 5000 },
          },
        },
      },
    };
    const captured = await runSetupAndCapture(config, okJson({ data: [] }));

    const req = captured.find((c) => c.url.includes("fallback.example.com"));
    expect(req).toBeDefined();
    expect(req!.authorization).toBe("Bearer sk-from-auth");
  });
});
