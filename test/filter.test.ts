import { describe, expect, it } from "bun:test";
import { formatSmartModelName, appendProviderNameToModelName, shouldIncludeModel } from "../src/rules/filter.js";

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

  it("展示名应保留斜杠前的分组前缀并格式化模型名", () => {
    expect(formatSmartModelName("deepseek-ai/deepseek-chat")).toBe("deepseek-ai/Deepseek Chat");
    expect(formatSmartModelName("qwen-coder-32b")).toBe("Qwen Coder 32b");
    expect(formatSmartModelName("grok-4.7-build-fast")).toBe("Grok 4.7 Build Fast");
    expect(formatSmartModelName("gpt-image-2.5")).toBe("GPT Image 2.5");
  });

  it("同一模型在不同分组下展示名必须可区分", () => {
    expect(formatSmartModelName("456/DeepSeek")).toBe("456/DeepSeek");
    expect(formatSmartModelName("group/deepseek-v4.1-flash")).toBe("group/Deepseek V4.1 Flash");
    expect(formatSmartModelName("deepseek-v4.1-flash")).toBe("Deepseek V4.1 Flash");
    expect(formatSmartModelName("workbuddy-ai/deepseek-v4.1-flash"))
      .toBe("workbuddy-ai/Deepseek V4.1 Flash");
    // 多级前缀完整保留
    expect(formatSmartModelName("a/b/model-x")).toBe("a/b/Model X");
    // 退化 id 原样返回，不产生空名
    expect(formatSmartModelName("456/")).toBe("456/");
  });

  it("支持在模型名称后追加 (providerName)，且模型 id 保持不变", () => {
    const rawId = "deepseek-ai/deepseek-chat";
    const smartName = formatSmartModelName(rawId);
    const withProvider = appendProviderNameToModelName(smartName, "Custom Provider");
    expect(withProvider).toBe("deepseek-ai/Deepseek Chat (Custom Provider)");
    // 确保原始 id 未受影响
    expect(rawId).toBe("deepseek-ai/deepseek-chat");

    // 不重复追加
    expect(appendProviderNameToModelName("Deepseek Chat (Custom Provider)", "Custom Provider"))
      .toBe("Deepseek Chat (Custom Provider)");

    // providerName 为空时的回退
    expect(appendProviderNameToModelName("Deepseek Chat", "")).toBe("Deepseek Chat");
    expect(appendProviderNameToModelName("Deepseek Chat", "   ")).toBe("Deepseek Chat");
    expect(appendProviderNameToModelName("Deepseek Chat", undefined)).toBe("Deepseek Chat");
  });
});
