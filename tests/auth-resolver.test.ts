import { describe, expect, it } from "bun:test";
import { resolveProviderApiKey } from "../src/fetcher/auth-resolver.js";

describe("auth-resolver", () => {
  it("应优先使用显式提供的 apiKey", async () => {
    const key = await resolveProviderApiKey("any-provider", "explicit-key-123");
    expect(key).toBe("explicit-key-123");
  });

  it("当未显式提供 apiKey 时，应尝试从环境变量或 auth.json 中读取", async () => {
    process.env.OPENCODE_AUTH_CONTENT = JSON.stringify({
      "mock-ai": { key: "sk-mock-env-test-999" }
    });
    const key = await resolveProviderApiKey("mock-ai");
    expect(key).toBe("sk-mock-env-test-999");
    delete process.env.OPENCODE_AUTH_CONTENT;
  });

  it("不存在的 provider 应返回 undefined", async () => {
    const key = await resolveProviderApiKey("non-existent-provider-xyz");
    expect(key).toBeUndefined();
  });
});
