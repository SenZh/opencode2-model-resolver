import { describe, expect, it } from "bun:test";
import { lookupModelsDev } from "../src/fetcher/models-dev.js";
import type { ModelsDevModel } from "../src/fetcher/models-dev.js";

function makeCache(entries: Array<[string, Partial<ModelsDevModel>]>): Map<string, ModelsDevModel> {
  const map = new Map<string, ModelsDevModel>();
  for (const [key, partial] of entries) {
    map.set(key, {
      id: partial.id ?? key.split("/").pop()!,
      ...partial,
    } as ModelsDevModel);
  }
  return map;
}

describe("models.dev 元数据查询：分组前缀不参与匹配 (lookupModelsDev)", () => {
  const cache = makeCache([
    ["deepseek/deepseek-v4.1-flash", { limit: { context: 1_000_000, output: 384_000 } }],
    ["openai/gpt-4o", { limit: { context: 128_000, output: 16_384 } }],
    ["vendor/model-x", { limit: { context: 200_000, output: 8_192 } }],
  ]);

  it("带分组前缀的 id 应按实际模型名命中权威条目", () => {
    const withGroup = lookupModelsDev("group/deepseek-v4.1-flash", cache);
    const plain = lookupModelsDev("deepseek-v4.1-flash", cache);
    expect(withGroup).toBeDefined();
    expect(withGroup?.limit).toEqual({ context: 1_000_000, output: 384_000 });
    // 分组前缀不得改变匹配结果
    expect(withGroup).toBe(plain);
  });

  it("多级分组前缀同样被剥离", () => {
    expect(lookupModelsDev("a/b/model-x", cache)?.limit?.context).toBe(200_000);
  });

  it("冒号标签不影响分组前缀剥离", () => {
    expect(lookupModelsDev("group/deepseek-v4.1-flash:latest", cache)?.limit?.output).toBe(384_000);
  });

  it("完整 id 精确匹配仍优先于尾段匹配", () => {
    const dual = makeCache([
      ["openai/gpt-4o", { limit: { context: 111 } }],
      ["other/gpt-4o", { limit: { context: 222 } }],
    ]);
    expect(lookupModelsDev("openai/gpt-4o", dual)?.limit?.context).toBe(111);
    expect(lookupModelsDev("other/gpt-4o", dual)?.limit?.context).toBe(222);
  });

  it("尾段精确匹配优先于骨架模糊匹配，分组前缀不得把命中挪到近似条目", () => {
    const ambiguous = makeCache([
      ["x/gpt-4o", { limit: { context: 100 } }],
      ["y/gpt4o", { limit: { context: 999 } }],
    ]);
    // 骨架归一化下 gpt-4o 与 gpt4o 等价，但尾段精确必须赢
    expect(lookupModelsDev("group/gpt-4o", ambiguous)?.limit?.context).toBe(100);
  });

  it("无前缀的裸模型名行为不变", () => {
    expect(lookupModelsDev("model-x", cache)?.limit?.context).toBe(200_000);
    expect(lookupModelsDev("unknown-model", cache)).toBeUndefined();
  });

  it("版本边界守卫仍生效：分组前缀下 kimik2.7 不得继承 kimik2", () => {
    const kimi = makeCache([
      ["moonshot/kimik2", { limit: { context: 131_072 } }],
      ["moonshot/kimik2.7", { limit: { context: 262_144 } }],
    ]);
    expect(lookupModelsDev("group/kimik2.7", kimi)?.limit?.context).toBe(262_144);
    // 未收录的子版本不得回落到父代际
    expect(lookupModelsDev("group/kimik2.8", kimi)).toBeUndefined();
  });
});
