import { describe, expect, it, afterAll } from "bun:test";
import { ModelCacheStore } from "../src/store/cache-store.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// 使用临时目录，避免污染用户真实的 ~/.cache/opencode2-model-resolver
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oc2-cache-store-test-"));

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

describe("cache-store", () => {
  it("应能成功写入并读出 Provider 模型独立缓存", async () => {
    const store = new ModelCacheStore(tmpDir);
    const testModels = {
      "test-model-1": {
        name: "Test Model 1",
        limit: { context: 1048576, output: 65536 },
      },
    };

    await store.save("unit-test-provider", testModels);
    const readBack = await store.read("unit-test-provider");

    expect(readBack).toBeDefined();
    expect(readBack?.["test-model-1"]?.name).toBe("Test Model 1");
    expect(readBack?.["test-model-1"]?.limit?.context).toBe(1048576);
  });

  it("读取不存在的 provider 应返回 undefined", async () => {
    const store = new ModelCacheStore(tmpDir);
    const result = await store.read("nonexistent-provider-xyz");
    expect(result).toBeUndefined();
  });
});
