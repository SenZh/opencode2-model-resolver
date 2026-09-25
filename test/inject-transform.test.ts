import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// 隔离缓存目录与 home，避免污染用户真实环境
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "oc2-inject-test-"));
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

/** 构造 provider 模型编辑器 mock */
function makeProviderEditor() {
  const models = new Map<string, any>();
  return {
    state: models,
    editor: {
      models: {
        update: (providerID: string, modelID: string, fn: (m: any) => void) => {
          const key = `${providerID}/${modelID}`;
          const m = models.get(key) || { id: modelID, providerID };
          fn(m);
          models.set(key, m);
        },
      },
    },
  };
}

describe("注入端 transform 写入 capabilities (集成-1)", () => {
  it("从缓存 payload 注入时应写入 capabilities 与 reasoning，不注入 attachment", async () => {
    // 预置缓存：新 schemaVersion=2，含 capabilities
    const cacheDir = path.join(tmpHome, ".cache", "opencode2-model-resolver");
    fs.mkdirSync(cacheDir, { recursive: true });
    const payload = {
      schemaVersion: 2,
      updatedAt: Date.now(),
      models: [
        {
          id: "gemini-3.8-flash",
          name: "Gemini 3.8 Flash (Test)",
          limit: { context: 1048576, output: 65536 },
          reasoning: true,
          capabilities: {
            tools: true,
            input: ["text", "image", "video", "audio", "pdf"],
            output: ["text"],
          },
        },
      ],
    };
    fs.writeFileSync(
      path.join(cacheDir, "test-provider-models.json"),
      JSON.stringify(payload),
      "utf8"
    );

    const { state, editor } = makeProviderEditor();
    let transformFn: any = null;
    const mockCtx: any = {
      provider: {
        transform: (fn: any) => {
          transformFn = fn;
          return Promise.resolve({ dispose: async () => {} });
        },
        reload: async () => {},
      },
    };

    plugin.setup(mockCtx);
    expect(transformFn).toBeTypeOf("function");

    transformFn(editor);

    const injected = state.get("test-provider/gemini-3.8-flash");
    expect(injected).toBeDefined();
    expect(injected.capabilities).toBeDefined();
    expect(injected.capabilities.tools).toBe(true);
    expect(injected.capabilities.input).toEqual(["text", "image", "video", "audio", "pdf"]);
    expect(injected.capabilities.output).toEqual(["text"]);
    // limit 仍正确写入
    expect(injected.limit.context).toBe(1048576);
    // reasoning 写入（缓存字段，V1/旧路径兼容用）
    expect(injected.reasoning).toBe(true);
  });

  it("旧 schemaVersion=1 的缓存被跳过，不注入", () => {
    const cacheDir = path.join(tmpHome, ".cache", "opencode2-model-resolver");
    fs.writeFileSync(
      path.join(cacheDir, "legacy-provider-models.json"),
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: Date.now(),
        models: [{ id: "old-model", name: "Old", limit: { context: 1, output: 1 } }],
      }),
      "utf8"
    );

    const { state, editor } = makeProviderEditor();
    let transformFn: any = null;
    const mockCtx: any = {
      provider: {
        transform: (fn: any) => {
          transformFn = fn;
          return Promise.resolve({ dispose: async () => {} });
        },
        reload: async () => {},
      },
    };
    plugin.setup(mockCtx);
    transformFn(editor);

    expect(state.get("legacy-provider/old-model")).toBeUndefined();
  });
});
