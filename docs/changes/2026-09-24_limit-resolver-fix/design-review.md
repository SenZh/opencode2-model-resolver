# 设计审查 — limit 解析接入 models.dev

## 一、主 agent 自审

| 检视项 | 结果 | 说明 |
|-------|------|------|
| 事实/推断分离 | ✅ | analysis.md 15 事实 / 1 推断，推断由 F4+F8 反证锁定 |
| 方案对比表 ≥2 候选 | ✅ | A/B/C 三方案，含选/不选理由 |
| 根因有证据链 | ✅ | 22 条缓存逐条比对，全部可解释 |
| 设计产物齐全 | ✅ | requirements / analysis / tech-design / contract / test-plan |
| 契约 3 类场景 | ✅ | 主路径 / 边界 / 相邻 |
| 目标可量化 | ✅ | G2-G4 有具体数值 |

**自审结论**：产物齐全，但 0 值语义存在文档矛盾（下方 sub-agent 也发现），已修正。

## 二、sub-agent 独立审查

审查者针对 6 个维度逐项审查，提出以下发现：

| # | 类型 | 问题描述 | 引用位置 | 严重度 | 是否解决 | 解决方式 |
|---|------|---------|---------|--------|---------|---------|
| 1 | 逻辑-设计矛盾 | 0 值决策三处表述冲突：tech-design:86 说回落、:139 说保留 0、contract:40 说行为不变 | tech-design.md:86/:139, contract.md:40 | 高 | ✅ | 新增 tech-design 第六节「0 值语义（唯一权威定义）」，统一为回落；修正 contract:40 |
| 2 | 逻辑-推导错误 | gpt-image 实际走第 5 分支 FALLBACK，文档写"规则兜底" | tech-design.md:139 | 高 | ✅ | 第六节写明走 FALLBACK 分支 |
| 3 | 边界-遗漏 | 失败防护文件级跳过会导致 models.dev 长期不可用时缓存永久冻结 | tech-design.md:111 | 中 | ✅ | 改为字段级防护（3.3 节重写），声明副作用 |
| 4 | 风险-验证失效 | 主路径-4 用 grep 验证不可证伪 | contract.md:10 | 中 | ✅ | 改为行为断言（集成单测） |
| 5 | 契约-遗漏 | 边界-3 遗漏「空 Map + 无旧缓存」分支 | contract.md | 中 | ✅ | 边界-3 拆为两种情形；新增边界-6 |
| 6 | 契约-表述 | "返回纯规则值"不准，第 2 分支含服务端元数据 | contract.md:13 | 低 | ✅ | 改为「resolveModelLimit 的输出」 |
| 7 | 设计-完整性 | matchedModelsDev 在 limit 缺失时取值未定义 | tech-design.md:73 | 低 | ✅ | 定义为 lookupModelsDev !== undefined 且有正 limit |
| 8 | 一致性 | 引用不存在的 test-plan.md | tech-design.md:129 | 低 | ✅ | 已补 test-plan.md |
| 9 | 设计 | 读取兼容遗漏 cachedModels.length 日志同步 | index.ts:75 | 中 | ✅ | 3.2 节补必须同步修改点 |
| 10 | 设计 | 三处 existing.limit 合并顺序差异，消重后需确认不漂移 | catalog-injector.ts:130 / config-injector-v1.ts:77 | 低 | ✅ | tech-design 明确「仅消 limit 层，existing 合并保留在各调用点」 |

## 三、裁决结论

**差异点仲裁**：sub-agent 的 P0-1（0 值矛盾）与 P0-2（gpt-image 推导）我在自审时未发现，**采纳**。其审查质量合格——每个发现均有具体行号引用，严重度分布合理（2 高 / 4 中 / 4 低），维度覆盖完整。

**审查质量校验**：
- 每个发现是否有具体引用？✅ 全部有（行号或段落）
- 维度覆盖是否完整？✅ 6 维度全覆盖
- 严重度是否有区分？✅ 2 高 4 中 4 低

**结论**：审查有效。全部 10 项发现已解决 → **设计审查通过，可进入 Phase 2**。

## 四、遗留（转为 Phase 3 遗留问题）

- 生图模型（`gpt-image-*`）是否应从过滤层排除 → 需产品决策。
- `lookupModelsDev:99` 硬编码组织白名单 → 脆弱性优化。
- `lookupModelsDev` 最长前缀优先 → 歧义鲁棒性优化。
