# 阶段一：架构设计审查与裁决报告 (Design Review & Verdict)

## 1. 评审概述
- **审查范围**：`requirements.md`、`analysis.md`、`tech-design.md`、`contract.md`、`test-plan.md`、`test-cases.md`
- **审查人**：主 Agent 自审 + Review Subagent 独立审查
- **审查结论**：**修改后通过 (Approved with Reservations)**

## 2. 审查发现问题清单

| 编号 | 级别 | 缺陷类型 | 影响模块 | 问题描述与整改要求 | 裁决结果 |
| :--- | :---: | :--- | :--- | :--- | :---: |
| **ISSUE-01** | **P1** | 渲染歧义 / 虚假零值 | `tech-design.md`<br>`contract.md` | `cache_read ?? 0` 会将不支持 Prompt Caching 的模型强行显示为 `$0.00`（免费），而非破折号 `—`。**整改：**遵循 Effect Schema，缺省时不设 key（保持 `undefined`）。 | **采纳** |
| **ISSUE-02** | **P1** | 性能瓶颈 / 算法缺陷 | `tech-design.md` | 对 8179 个模型进行全遍历匹配复杂度为 $O(N \times M)$。**整改：**在数据拉取后构建预索引字典（官方表、全局表、尾段表），使匹配复杂度降为 $O(1)$。 | **采纳** |
| **ISSUE-03** | **P1** | 容灾失效 / 迁移缺陷 | `src/index.ts` | 缓存升版为 `3` 后，若升级首次扫描断网，v2 缓存因严格匹配被丢弃，导致 limit 防护失效。**整改：**扫描防护读取旧缓存支持兼容读取 `schemaVersion >= 2`。 | **采纳** |
| **ISSUE-04** | **P1** | 状态竞争 / 字段合并 | `tech-design.md` | 双数据源（`models.json` 与 `api.json`）独立失败时，整条替换会互相踩踏。**整改：**重构 `buildCachedEntry` 为真正的多数据源独立字段级装配。 | **采纳** |
| **ISSUE-05** | **P2** | 契约破坏 / 覆盖隐患 | `tech-design.md`<br>`contract.md` | 缺省成本时不应盲目写 `modelDef.cost = []`。**整改：**改为有条件写入（仅在 `costArray.length > 0` 时赋值）。 | **采纳** |
| **ISSUE-06** | **P2** | 边界判定 / 误伤风险 | `tech-design.md`<br>`test-cases.md` | 前缀模糊匹配缺少分隔符（`-`, `_`, `:`, `/`）约束，可能误伤同名前缀模型。**整改：**增加单词边界分隔符校验。 | **采纳** |

## 3. 修改行动清单
1. 立即更新 `tech-design.md`：
   - 修正注入端映射（移除 `?? 0`，保留 `undefined`）。
   - 补充预索引索引表架构设计（`Pre-indexed Map`）。
   - 明确前缀匹配的分隔符边界规则。
   - 重构 `buildCachedEntry` 为独立字段级装配，并在扫描阶段兼容支持 v2 历史缓存降级读取。
2. 立即更新 `contract.md`：
   - 修正运行时 `cost` 数组中的 `cache` 可选字段契约。
   - 明确有条件注入规则。
3. 立即更新 `test-cases.md`：
   - 补充免费模型 0 值定价、双源独立降级、前缀边界防误伤等 5 个补充用例。
4. 审查门禁关闭，进入阶段二编码实现。
