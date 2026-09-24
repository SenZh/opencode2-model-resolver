import { describe, expect, it } from "bun:test";
import { formatSmartModelName, shouldIncludeModel } from "../src/rules/filter.js";

describe("模型过滤与命名格式化测试 (filter)", () => {
  it("应自动过滤非对话模型（embedding, rerank, tts, whisper）", () => {
    expect(shouldIncludeModel({ id: "text-embedding-v3" })).toBe(false);
    expect(shouldIncludeModel({ id: "bge-reranker-large" })).toBe(false);
    expect(shouldIncludeModel({ id: "whisper-1" })).toBe(false);
    expect(shouldIncludeModel({ id: "dall-e-3" })).toBe(false);
  });

  it("对话模型应被正常保留", () => {
    expect(shouldIncludeModel({ id: "deepseek-chat" })).toBe(true);
    expect(shouldIncludeModel({ id: "qwen2.5-coder-32b" })).toBe(true);
  });

  it("应正确响应自定义 include / exclude", () => {
    const include = ["^deepseek"];
    expect(shouldIncludeModel({ id: "deepseek-chat" }, include)).toBe(true);
    expect(shouldIncludeModel({ id: "gpt-4o" }, include)).toBe(false);

    const exclude = ["vision"];
    expect(shouldIncludeModel({ id: "qwen-vl-vision" }, undefined, exclude)).toBe(false);
  });

  it("展示名应去除组织前缀并格式化", () => {
    expect(formatSmartModelName("deepseek-ai/deepseek-chat")).toBe("Deepseek Chat");
    expect(formatSmartModelName("qwen-coder-32b")).toBe("Qwen Coder 32b");
    expect(formatSmartModelName("grok-4.7-build-fast")).toBe("Grok 4.7 Build Fast");
    expect(formatSmartModelName("gpt-image-2.5")).toBe("GPT Image 2.5");
  });
});
