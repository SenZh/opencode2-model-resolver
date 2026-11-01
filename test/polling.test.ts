import { describe, expect, it } from "bun:test";
import {
  areModelEntriesEqual,
  resolvePollingInterval,
  DEFAULT_REFRESH_INTERVAL_MS,
  MIN_REFRESH_INTERVAL_MS,
  type CachedModelEntry,
} from "../src/index.js";

const BASE_MODEL: CachedModelEntry = {
  id: "deepseek-v4.1-flash",
  name: "DeepSeek V4.1 Flash",
  limit: { context: 1000000, output: 384000 },
  reasoning: true,
  capabilities: {
    tools: true,
    input: ["text", "image"],
    output: ["text"],
  },
  cost: {
    input: 0.155,
    output: 0.62,
    cache_read: 0.0031,
  },
};

describe("模型条目相等性比较与变动检测 (areModelEntriesEqual)", () => {
  it("空值或同为空数组应判定为相等", () => {
    expect(areModelEntriesEqual(undefined, undefined)).toBe(true);
    expect(areModelEntriesEqual(null, null)).toBe(true);
    expect(areModelEntriesEqual([], [])).toBe(true);
  });

  it("一空一有应判定为不相等", () => {
    expect(areModelEntriesEqual(undefined, [BASE_MODEL])).toBe(false);
    expect(areModelEntriesEqual([BASE_MODEL], null)).toBe(false);
    expect(areModelEntriesEqual([], [BASE_MODEL])).toBe(false);
  });

  it("相同内容的模型数组应判定为相等", () => {
    const listA = [{ ...BASE_MODEL }];
    const listB = [{ ...BASE_MODEL }];
    expect(areModelEntriesEqual(listA, listB)).toBe(true);
  });

  it("模型顺序不同但内容相同时应判定为相等（顺序无关性）", () => {
    const model2: CachedModelEntry = {
      ...BASE_MODEL,
      id: "gpt-6.1-terra",
      name: "GPT 6.1 Terra",
    };
    const listA = [BASE_MODEL, model2];
    const listB = [model2, BASE_MODEL];
    expect(areModelEntriesEqual(listA, listB)).toBe(true);
  });

  it("模型数量变化时判定为不相等", () => {
    const model2: CachedModelEntry = {
      ...BASE_MODEL,
      id: "gpt-6.1-terra",
    };
    expect(areModelEntriesEqual([BASE_MODEL], [BASE_MODEL, model2])).toBe(false);
  });

  it("模型展示名变化时判定为不相等", () => {
    const modified: CachedModelEntry = {
      ...BASE_MODEL,
      name: "DeepSeek V4.1 Flash (Updated)",
    };
    expect(areModelEntriesEqual([BASE_MODEL], [modified])).toBe(false);
  });

  it("模型上下文 limit 变化时判定为不相等", () => {
    const modified: CachedModelEntry = {
      ...BASE_MODEL,
      limit: { ...BASE_MODEL.limit, context: 2000000 },
    };
    expect(areModelEntriesEqual([BASE_MODEL], [modified])).toBe(false);
  });

  it("模型定价 cost 变化时判定为不相等", () => {
    const modified: CachedModelEntry = {
      ...BASE_MODEL,
      cost: { ...BASE_MODEL.cost!, input: 0.99 },
    };
    expect(areModelEntriesEqual([BASE_MODEL], [modified])).toBe(false);
  });

  it("模型能力 capabilities 变化时判定为不相等", () => {
    const modified: CachedModelEntry = {
      ...BASE_MODEL,
      capabilities: { ...BASE_MODEL.capabilities, tools: false },
    };
    expect(areModelEntriesEqual([BASE_MODEL], [modified])).toBe(false);
  });
});

describe("全局定时轮询周期解析 (resolvePollingInterval)", () => {
  it("无 target 时返回 0（禁用）", () => {
    expect(resolvePollingInterval([])).toBe(0);
  });

  it("未显式配置周期时回退 DEFAULT_REFRESH_INTERVAL_MS (60s)", () => {
    const targets = [{ discovery: {} }];
    expect(resolvePollingInterval(targets)).toBe(DEFAULT_REFRESH_INTERVAL_MS);
  });

  it("配置自定义 refreshIntervalMs 时正确取值", () => {
    const targets = [{ discovery: { refreshIntervalMs: 30000 } }];
    expect(resolvePollingInterval(targets)).toBe(30000);
  });

  it("支持别名 pollIntervalMs", () => {
    const targets = [{ discovery: { pollIntervalMs: 45000 } }];
    expect(resolvePollingInterval(targets)).toBe(45000);
  });

  it("多 target 时取最小的有效周期", () => {
    const targets = [
      { discovery: { refreshIntervalMs: 120000 } },
      { discovery: { refreshIntervalMs: 25000 } },
      { discovery: {} }, // 默认 60s
    ];
    expect(resolvePollingInterval(targets)).toBe(25000);
  });

  it("周期低于安全下限时被自动截断至 MIN_REFRESH_INTERVAL_MS (5s)", () => {
    const targets = [{ discovery: { refreshIntervalMs: 1000 } }];
    expect(resolvePollingInterval(targets)).toBe(MIN_REFRESH_INTERVAL_MS);
  });

  it("全部显式为 0 时返回 0 禁用轮询", () => {
    const targets = [
      { discovery: { refreshIntervalMs: 0 } },
      { discovery: { pollIntervalMs: 0 } },
    ];
    expect(resolvePollingInterval(targets)).toBe(0);
  });

  it("部分为 0 但有其他未配置时，未配置者走默认 60s", () => {
    const targets = [
      { discovery: { refreshIntervalMs: 0 } },
      { discovery: {} },
    ];
    expect(resolvePollingInterval(targets)).toBe(DEFAULT_REFRESH_INTERVAL_MS);
  });
});
