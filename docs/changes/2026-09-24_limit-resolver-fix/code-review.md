# 代码审查 — limit 解析接入 models.dev

## 一、主 agent 自审

| 检视项 | 结果 | 说明 |
|-------|------|------|
| 实现是否遵循 tech-design | ✅ | `resolveAuthoritativeLimit` 合并语义、缓存版本化、失败防护均已实现 |
| `resolveModelLimit` 是否有回归 | ✅ | 签名与语义未变，limits-database.test.ts 7 例全绿 |
| 编译是否通过 | ✅ | `bunx tsc --noEmit` 无错误 |
| 测试是否通过 | ✅ | 42 例全绿 |
| 坏日志是否修复 | ✅ | `catalog-injector.ts:51` 改为 `modelsDevCache.size` |

## 二、sub-agent 独立审查

| # | 类型 | 问题描述 | 引用位置 | 严重度 | 是否解决 | 解决方式 |
|---|------|---------|---------|--------|---------|---------|
| 1 | 逻辑-防护失效 | `buildCachedEntry` 条件 `!matchedModelsDev && prevHasUsableLimit` 对永不在 models.dev 的模型（hy3、gpt-image-*）恒真，导致规则库更新无法生效（永久冻结） | index.ts:36-41 | 高 | ✅ | 新增 `modelsDevAvailable` 参数，仅当 models.dev 整体不可用时才保留旧值 |
| 2 | 逻辑-判定不准 | `matchedModelsDev: hasDevContext` 只看 context；context=0 但 output>0 时采用了权威 output 却报 false，被防护丢弃 | limits-database.ts:366,384 | 中 | ✅ | 改为 `hasDevContext \|\| hasDevOutput \|\| hasDevInput` |
| 3 | 回归-冗余表达 | `authoritative.reasoning` 已含 devInfo 判定，调用点又写 `devInfo?.reasoning \|\|` 冗余 | catalog-injector.ts:138 等 | 低 | ⏸ | 逐项推导后行为等价，仅可读性问题，留作后续清理 |
| 4 | 一致性-分叉 | transform 冷启动读缓存快照，与实时路径在 models.dev 更新后短暂分叉 | index.ts:148-161 | 低 | ✅ | 属设计权衡，已在 contract 说明 |
| 5 | 重复查询 | catalog-injector 同时调 `lookupModelsDev` 与 `resolveAuthoritativeLimit`（内部再查一次） | catalog-injector.ts:105,108 | 低 | ⏸ | 内存 Map 遍历，性能可接受，留作优化 |
| 6 | 类型重复 | `CachedModelEntry.limit` 与 `types.ts` 的 `ModelLimit` 结构重复 | index.ts:14 | 低 | ⏸ | 留作后续统一 |

## 三、裁决结论

**差异点仲裁**：sub-agent 的 P0（防护冻结）与 P1（判定不准）我在自审时**未发现**，采纳并已修复。其审查质量合格——逐维度审查、每个发现带行号、严重度分布合理（1 高 / 1 中 / 4 低）。

值得注意的是 sub-agent **主动修正了自己的判断**：初判 reasoning 为 P1 语义漂移，经四类情形逐项推导后自我更正为 P2 冗余表达（实际等价）。这是独立分析而非复述，审查可信。

**回归验证**：修复 P0 后新增测试用例「models.dev 可用但该模型本无条目 → 正常写入新规则值，不冻结旧值」；修复 P1 后新增「context=0 但 output>0 → matchedModelsDev=true」。两例均通过。

**审查质量校验**：
- 每个发现是否有具体引用？✅
- 维度覆盖是否完整？✅ 6 维度
- 严重度是否有区分？✅ 1 高 1 中 4 低

**结论**：审查有效。P0/P1 已解决 → **代码审查通过**。
