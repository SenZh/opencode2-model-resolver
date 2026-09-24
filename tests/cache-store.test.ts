import { describe, expect, it } from "bun:test";
import { modelCacheStore } from "../src/store/cache-store.js";

describe("cache-store", () => {
  it("应能成功写入并读出 Provider 模型独立缓存", async () => {
    const testModels = {
      "test-model-1": {
        name: "Test Model 1",
        limit: { context: 1048576, output: 65536 },
      },
    };

    await modelCacheStore.save("unit-test-provider", testModels);
    const readBack = await modelCacheStore.read("unit-test-provider");

    expect(readBack).toBeDefined();
    expect(readBack?.["test-model-1"]?.name).toBe("Test Model 1");
    expect(readBack?.["test-model-1"]?.limit?.context).toBe(1048576);
  });
});
