# 测试审查 — 生图模型过滤 + 能力字段补全

## 一、主 agent 自审

| 检视项 | 结果 | 说明 |
|-------|------|------|
| 契约条目全覆盖 | ✅ | 修复 P1 后 18/18 |
| 用例可证伪 | ✅ | 布尔断言、数组精确断言 |
| 集成测试真实 | ✅ | 驱动真实 setup transform 回调 |
| 测试隔离 | ✅ | 实测运行前后缓存目录零变化 |
| 通过率 | ✅ | 81/81 |

## 二、sub-agent 独立审查（第一轮）

审查者结论：**不通过**（2 P1）。提出：

| # | 严重度 | 问题描述 | 引用位置 | 是否解决 | 解决方式 |
|---|-------|---------|---------|---------|---------|
| 1 | P1 | 契约边界-7（前缀命中拿不到父条目）无对应用例；test-cases 与 test-plan 对 TC-13 定义矛盾 | contract.md:20 | ✅ | 新增 TC-13 用例（直接断言 `lookupModelsDev("gpt-image-2.5", flareOnly) === undefined`）+ 端到端断言；test-cases 拆为 TC-13/13b/13c |
| 2 | P1 | 契约边界-1b（models.dev 可用但无条目）无独立用例 | contract.md:14 | ✅ | 新增 TC-13c 用例（REAL_CACHE 非空 + gpt-image-2.5 → 被过滤） |
| 3 | P2 | TC-14 的 `expect(injected.attachment).toBeUndefined()` 是恒真断言（实现无 attachment 写入路径） | inject-transform.test.ts:103 | ✅ | 删除该断言 |
| 4 | P2 | 集成-1 只覆盖注入端，未覆盖扫描端 transform 协作 | inject-transform.test.ts | ⏸ | 范围声明：本次集成测试定位为「缓存→注入」，扫描端已由 index-scan 端到端覆盖 |
| 5 | P2 | runtime.log 隔离依赖平台（未 mock os.homedir） | inject-transform.test.ts:12 | ⏸ | 实测零污染，接受；记为观察项 |
| 6 | P2 | 空数组→capabilities 回落侧未断言 | capabilities.test.ts | ✅ | 新增 TC-12b 用例 |
| 7 | P3 | TC-16 无用例 ID 前缀 | index-scan.test.ts:91 | ✅ | 补 `TC-16:` 前缀 |
| 8 | P3 | test-cases.md 文件归属错位 | test-cases.md | ✅ | 已修正 |
| 9 | P3 | cache-payload 部分用例因 schema 短路丧失字段校验能力 | cache-payload.test.ts:43,53 | ⏸ | 既有测试，非本次引入 |

## 三、裁决结论

**差异点仲裁**：P1-1 和 P1-2 完全成立——契约明确列出的可证伪标准确实没有测试守护，这是覆盖缺口。审查者还发现 test-cases.md 与 test-plan.md 对同一 TC-13 的定义互相矛盾（一个写"端到端过滤"，一个写"前缀命中"），属文档级不一致。全部采纳。

**审查质量校验**：
- 每个发现是否有具体引用？✅
- 维度覆盖是否完整？✅ 6 维度
- 严重度是否有区分？✅ 2 P1 / 4 P2 / 3 P3
- 是否独立分析？✅ 实测验证、快照对比、类型分析

**结论**：审查有效，P1 全部修复（新增 3 个用例，81 例全绿）→ **测试审查通过**。

## 四、遗留（转入 Phase 3）

1. `DEFAULT_EXCLUDE_KEYWORDS` 的 `"audio"` 会误伤多模态对话模型（既有缺陷）。
2. `tools` 与过滤判据解耦（无实际反例）。
3. `lookupModelsDev` 单模型路径调用 2 次（幂等）。
4. 集成测试的 runtime.log 隔离依赖平台行为。
5. cache-payload 部分用例因 schema 短路削弱字段校验。
