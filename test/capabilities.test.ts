import { describe, expect, it } from "bun:test";
import { shouldIncludeModel, resolveCapabilities } from "../src/rules/filter.js";
import type { ModelsDevModel } from "../src/fetcher/models-dev.js";

function devInfo(output: string[], input = ["text"], toolCall = true): ModelsDevModel {
  return {
    id: "x",
    modalities: { input, output },
    tool_call: toolCall,
  };
}

describe("非对话模型过滤 (shouldIncludeModel)", () => {
  it("TC-01: 纯 image 输出模型被过滤", () => {
    expect(shouldIncludeModel({ id: "gpt-image-2" }, undefined, undefined, devInfo(["image"]))).toBe(false);
  });

  it("TC-02: text+image 多模态模型保留", () => {
    expect(
      shouldIncludeModel({ id: "gemini-3.1-flash-image" }, undefined, undefined, devInfo(["text", "image"], ["text", "image"]))
    ).toBe(true);
  });

  it("TC-10: 纯 audio 被过滤；audio+text 保留", () => {
    expect(shouldIncludeModel({ id: "some-audio-model" }, undefined, undefined, devInfo(["audio"], ["audio"]))).toBe(false);
    // 注意：id 含 audio 会命中默认排除关键词，故用不含 audio 的 id 测模态逻辑
    expect(shouldIncludeModel({ id: "multimodal-x" }, undefined, undefined, devInfo(["audio", "text"], ["audio", "text"]))).toBe(true);
  });

  it("TC-07: 无 models.dev 数据时 gpt-image-2.5 被关键词兜底过滤", () => {
    expect(shouldIncludeModel({ id: "gpt-image-2.5" })).toBe(false);
    expect(shouldIncludeModel({ id: "grok-imagine-image-2.0" })).toBe(false);
    expect(shouldIncludeModel({ id: "some-video-model" })).toBe(false);
  });

  it("TC-08: 无 models.dev 数据时普通对话模型不被误伤", () => {
    expect(shouldIncludeModel({ id: "deepseek-chat" })).toBe(true);
    expect(shouldIncludeModel({ id: "gpt-5.6-luna" })).toBe(true);
    expect(shouldIncludeModel({ id: "qwen2.5-coder-32b" })).toBe(true);
  });

  it("TC-12: output 为空数组时等价于无模态数据（走关键词兜底）", () => {
    expect(shouldIncludeModel({ id: "gpt-image-2.5" }, undefined, undefined, devInfo([]))).toBe(false);
    expect(shouldIncludeModel({ id: "deepseek-chat" }, undefined, undefined, devInfo([]))).toBe(true);
  });

  it("TC-12b: output 为空数组时 capabilities 回落默认值", () => {
    const cap = resolveCapabilities({ id: "x", modalities: { input: ["text"], output: [] } });
    expect(cap.output).toEqual(["text"]);
  });

  it("原有过滤逻辑不被破坏", () => {
    expect(shouldIncludeModel({ id: "text-embedding-3" })).toBe(false);
    expect(shouldIncludeModel({ id: "qwen-vl-vision" }, undefined, ["vision"])).toBe(false);
    expect(shouldIncludeModel({ id: "gpt-4o" }, ["^deepseek"])).toBe(false);
  });
});

describe("能力映射 (resolveCapabilities)", () => {
  it("TC-03: gemini-3.8-flash 全能力", () => {
    const info: ModelsDevModel = {
      id: "google/gemini-3.8-flash",
      tool_call: true,
      modalities: { input: ["text", "image", "video", "audio", "pdf"], output: ["text"] },
    };
    const cap = resolveCapabilities(info);
    expect(cap.tools).toBe(true);
    expect(cap.input).toEqual(["text", "image", "video", "audio", "pdf"]);
    expect(cap.output).toEqual(["text"]);
  });

  it("TC-06: gpt-5.6-luna 能力", () => {
    const info: ModelsDevModel = {
      id: "openai/gpt-5.6-luna",
      tool_call: true,
      modalities: { input: ["text", "image", "pdf"], output: ["text"] },
    };
    const cap = resolveCapabilities(info);
    expect(cap.input).toEqual(["text", "image", "pdf"]);
    expect(cap.tools).toBe(true);
  });

  it("TC-04: 无 devInfo 返回默认值", () => {
    expect(resolveCapabilities(undefined)).toEqual({
      tools: false,
      input: ["text"],
      output: ["text"],
    });
  });

  it("TC-09: modalities 缺失时返回默认值", () => {
    const info: ModelsDevModel = { id: "x", tool_call: true };
    const cap = resolveCapabilities(info);
    expect(cap.input).toEqual(["text"]);
    expect(cap.output).toEqual(["text"]);
    expect(cap.tools).toBe(true);
  });

  it("tool_call 非 true 时 tools=false", () => {
    expect(resolveCapabilities({ id: "x", tool_call: false }).tools).toBe(false);
    expect(resolveCapabilities({ id: "x" }).tools).toBe(false);
  });

  it("input 缺失但 output 存在时，input 回落默认", () => {
    const cap = resolveCapabilities({ id: "x", modalities: { output: ["text"] } });
    expect(cap.input).toEqual(["text"]);
    expect(cap.output).toEqual(["text"]);
  });

  it("返回的数组是副本，不会被外部修改污染", () => {
    const info: ModelsDevModel = { id: "x", modalities: { input: ["text"], output: ["text"] } };
    const cap = resolveCapabilities(info);
    cap.input.push("mutated");
    expect(info.modalities!.input).toEqual(["text"]);
  });
});
