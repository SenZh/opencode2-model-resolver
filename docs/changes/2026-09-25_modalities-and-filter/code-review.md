# 代码审查 — 生图模型过滤 + 能力字段补全

## 一、主 agent 自审

| 检视项 | 结果 | 说明 |
|-------|------|------|
| 实现是否遵循 tech-design | ✅ | 过滤双分支、capabilities 映射、注入端写入均已落地 |
| 编译是否通过 | ✅ | `bunx tsc --noEmit` 0 错误 |
| 测试是否通过 | ✅ | 78 例全绿（新增 22 例） |
| 是否误写 attachment | ✅ | 已按实测取消（V2 无此字段） |

## 二、sub-agent 独立审查

审查者结论：**通过**（无 P0/P1）。提出 4 个 P2 + 2 个 P3：

| # | 类型 | 问题描述 | 引用位置 | 严重度 | 是否解决 | 解决方式 |
|---|------|---------|---------|--------|---------|---------|
| 1 | 契约-实现偏差 | `gpt-image-1.5` 在 models.dev 不可用时被关键词兜底过滤，与契约"因是多模态保留"矛盾 | filter.ts:29-30 vs contract.md:38 | 中 | ✅ | 实测确认 `gpt-image-1.5` 在 models.dev 有条目（output=["text","image"]）→ 通常保留；契约改为显式声明降级取舍 |
| 2 | 测试有效性 | `inject-transform.test.ts` 标题提 reasoning 但未断言 | inject-transform.test.ts:48 | 中 | ✅ | 修正标题 + 补 `expect(injected.reasoning).toBe(true)` 与 attachment 断言 |
| 3 | 数据一致性 | `buildCachedEntry` 返回 prev 时 capabilities 被冻结，测试未覆盖 | index.ts:56-58 | 中 | ✅ | 补断言：models.dev 不可用 + prev 有 capabilities 时，产出等于旧值 |
| 4 | 逻辑一致性 | `tools` 来源 `tool_call` 与过滤判据解耦 | filter.ts:76 | 中 | ⏸ | 低风险，当前无实际反例，保留现状 |
| 5 | 代码质量 | `!` 非空断言重复 | filter.ts:57,122 | 低 | ⏸ | strict 下可证明安全，接受 |
| 6 | 可维护性 | `reasoning` 写了不用，可能误导 | index.ts:23 | 低 | ⏸ | 已有注释区隔，接受 |

## 三、关键裁决

**P2-1 的核实**：审查者指出契约与实现可能矛盾，但前提「`gpt-image-1.5` 是否在 models.dev」未取证。我实测确认：

```
gpt-image-1.5  → suffix 命中，output=["text","image"]（多模态）
gpt-image-2.5  → NOT FOUND
```

结论：`gpt-image-1.5` 正常场景**保留**，仅 models.dev 整体不可用时会因关键词被过滤。属可接受的降级取舍，契约已改为显式声明。

**审查者额外发现（重要，超出本次范围）**：`DEFAULT_EXCLUDE_KEYWORDS` 含 `"audio"`,会导致 `gpt-4o-audio-preview` 这类**多模态对话模型**被过滤。审查者用 `git log -S '"audio"'` 确认这是 **v1.0.2 的既有行为**，非本次引入。与本次"保留能对话的多模态模型"意图相悖，记为遗留。

## 四、裁决结论

**审查质量校验**：
- 每个发现是否有具体引用？✅
- 维度覆盖是否完整？✅ 5 维度
- 严重度是否有区分？✅ 4 P2 / 2 P3
- 是否独立分析？✅ 做了 git 溯源、实测验证、类型收窄分析

**结论**：审查有效，P2-1/2/3 已修复，P2-4 与 P3 为可接受取舍 → **代码审查通过**。

## 五、遗留

1. `DEFAULT_EXCLUDE_KEYWORDS` 的 `"audio"` 会误伤多模态对话模型（既有缺陷，非本次引入）→ 建议后续改为「仅当 output 不含 text 时过滤」。
2. `tools` 与过滤判据解耦（无实际反例）。
3. `lookupModelsDev` 单模型路径调用 2 次（幂等，性能可忽略）。
