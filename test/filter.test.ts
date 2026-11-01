import { describe, expect, it } from "bun:test";
import {
  formatSmartModelName,
  resolveModelDisplayName,
  appendProviderNameToModelName,
  shouldIncludeModel,
} from "../src/rules/filter.js";

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

  describe("服务端展示名多级解析策略 (resolveModelDisplayName)", () => {
    it("优先采用 magpie_label 原生自带的分组与标签", () => {
      const name1 = resolveModelDisplayName({
        id: "group/deepseek-v4.1-flash",
        display_name: "DeepSeek-V4.1-Flash",
        magpie_label: "DeepSeek-V4.1-Flash — routing group",
      });
      expect(name1).toBe("DeepSeek-V4.1-Flash — routing group");

      const name2 = resolveModelDisplayName({
        id: "antigravity/gemini-3.8-flash-tiered",
        display_name: "Gemini 3.8 Flash (Tiered)",
        magpie_label: "Gemini 3.8 Flash (Tiered) — Antigravity",
      });
      expect(name2).toBe("Gemini 3.8 Flash (Tiered) — Antigravity");
    });

    it("仅有 display_name 时保留分组前缀与原生大小写标点", () => {
      const name = resolveModelDisplayName({
        id: "group/deepseek-v4.1-flash",
        display_name: "DeepSeek-V4.1-Flash",
      });
      expect(name).toBe("group/DeepSeek-V4.1-Flash");

      const name2 = resolveModelDisplayName({
        id: "antigravity/gemini-3.8-flash-tiered",
        display_name: "Gemini 3.8 Flash (Tiered)",
      });
      expect(name2).toBe("antigravity/Gemini 3.8 Flash (Tiered)");

      // 裸模型名没有前缀，直接使用 display_name
      const name3 = resolveModelDisplayName({
        id: "gpt-4o",
        display_name: "GPT-4o (Omni)",
      });
      expect(name3).toBe("GPT-4o (Omni)");
    });

    it("服务端 display_name 与 raw id 完全相同时回退智能格式化", () => {
      // 某些网关直接把 id 赋值给 name/display_name
      const name = resolveModelDisplayName({
        id: "group/deepseek-v4.1-flash",
        display_name: "group/deepseek-v4.1-flash",
      });
      expect(name).toBe("group/Deepseek V4.1 Flash");
    });

    it("无服务端展示名字段时（如 CPA）回退智能美化", () => {
      const name = resolveModelDisplayName({
        id: "group/deepseek-v4.1-flash",
      });
      expect(name).toBe("group/Deepseek V4.1 Flash");

      const name2 = resolveModelDisplayName({
        id: "gpt-6.1-terra",
      });
      expect(name2).toBe("GPT 6.1 Terra");
    });

    it("smartModelName === false 时严格忠实于原始 ID", () => {
      const name = resolveModelDisplayName(
        {
          id: "group/deepseek-v4.1-flash",
          display_name: "DeepSeek-V4.1-Flash",
          magpie_label: "DeepSeek-V4.1-Flash — routing group",
        },
        { smartModelName: false }
      );
      expect(name).toBe("group/deepseek-v4.1-flash");
    });
  });
});
