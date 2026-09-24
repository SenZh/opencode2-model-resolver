import { describe, expect, it } from "bun:test";
import { resolveModelLimit, FALLBACK_MODEL_LIMIT } from "../src/rules/limits-database.js";

describe("智能上下文推断规则测试 (limits-database)", () => {
  it("应准确识别 DeepSeek 系列模型（128K 上下文）", () => {
    const res1 = resolveModelLimit({ id: "deepseek-chat" });
    expect(res1.limit.context).toBe(131072);
    expect(res1.limit.output).toBe(8192);

    const res2 = resolveModelLimit({ id: "deepseek-ai/DeepSeek-R1" });
    expect(res2.limit.context).toBe(131072);
    expect(res2.reasoning).toBe(true);
  });

  it("应准确识别 Qwen 2.5 系列模型（128K 上下文）", () => {
    const res = resolveModelLimit({ id: "qwen2.5-coder-32b-instruct" });
    expect(res.limit.context).toBe(131072);
    expect(res.limit.output).toBe(16384);
  });

  it("应准确识别 GLM-5 与 GLM-4 模型", () => {
    const glm5 = resolveModelLimit({ id: "glm-5" });
    expect(glm5.limit.context).toBe(200000);
    expect(glm5.limit.output).toBe(16384);

    const glm4 = resolveModelLimit({ id: "glm-4-plus" });
    expect(glm4.limit.context).toBe(131072);
    expect(glm4.limit.output).toBe(4096);
  });

  it("应准确识别 Llama 3.1（128K）与 Llama 3（8K）", () => {
    const llama31 = resolveModelLimit({ id: "meta-llama/Meta-Llama-3.1-70B-Instruct" });
    expect(llama31.limit.context).toBe(131072);

    const llama3 = resolveModelLimit({ id: "meta-llama/Meta-Llama-3-8B-Instruct" });
    expect(llama3.limit.context).toBe(8192);
  });

  it("应优先读取服务端返回的 vLLM / LiteLLM 扩展字段", () => {
    const rawWithVllm = {
      id: "my-custom-finetuned-model",
      max_model_len: 65536,
      max_output_tokens: 4096,
    };
    const res = resolveModelLimit(rawWithVllm);
    expect(res.limit.context).toBe(65536);
    expect(res.limit.output).toBe(4096);
  });

  it("应识别名称中自带的后缀标号（如 256k, 1m）", () => {
    const res256k = resolveModelLimit({ id: "custom-model-256k" });
    expect(res256k.limit.context).toBe(256 * 1024);

    const res1m = resolveModelLimit({ id: "kimi-k2-1m" });
    expect(res1m.limit.context).toBe(1024 * 1024);
  });

  it("应尊重用户自定义 rules（最高优先级）", () => {
    const customRules = [
      {
        match: "^special-model",
        limit: { context: 524288, output: 32768 },
        reasoning: true,
      },
    ];
    const res = resolveModelLimit({ id: "special-model-test" }, customRules);
    expect(res.limit.context).toBe(524288);
    expect(res.limit.output).toBe(32768);
    expect(res.reasoning).toBe(true);
  });

  it("未知模型回退到安全默认值（128K），不再是过小的 4K", () => {
    const unknown = resolveModelLimit({ id: "some-completely-unknown-model" });
    expect(unknown.limit.context).toBe(FALLBACK_MODEL_LIMIT.context);
  });
});
