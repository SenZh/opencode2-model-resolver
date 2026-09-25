# 测试结果 — 生图模型过滤 + 能力字段补全

## 一、执行汇总

| 总用例数 | 通过 | 失败 | 跳过 | 通过率 |
|---------|------|------|------|-------|
| 81 | 81 | 0 | 0 | 100% |

执行命令：`bun test` → `Ran 81 tests across 10 files`
类型检查：`bunx tsc --noEmit -p tsconfig.json` → 0 错误

## 二、分文件明细

| 文件 | 用例数 | 结果 |
|------|-------|------|
| test/capabilities.test.ts | 15 | 全通过（新增） |
| test/cache-payload.test.ts | 16 | 全通过（含 schemaVersion=2 更新） |
| test/index-scan.test.ts | 15 | 全通过（新增 8 例过滤/能力/边界） |
| test/inject-transform.test.ts | 2 | 全通过（新增，注入端集成） |
| test/authoritative-limit.test.ts | 13 | 全通过（回归） |
| test/limits-database.test.ts | 8 | 全通过（回归） |
| test/filter.test.ts | 5 | 全通过（回归） |
| test/v2-catalog.test.ts | 2 | 全通过（回归） |
| tests/auth-resolver.test.ts | 3 | 全通过（回归） |
| tests/cache-store.test.ts | 2 | 全通过（回归） |
| **合计** | **81** | **全通过** |

新增 25 例。

## 三、关键验证

| 验证项 | 结果 |
|-------|------|
| 纯 image 模型（gpt-image-2）被过滤 | ✅ TC-01/TC-13 |
| 多模态 image（gemini-3.1-flash-image）保留 | ✅ TC-02 |
| 关键词兜底（gpt-image-2.5 无 dev 数据） | ✅ TC-07 |
| 普通模型不被误伤 | ✅ TC-08/TC-19 |
| gemini-3.8-flash 全能力（5 项输入） | ✅ TC-03 |
| gpt-5.6-luna 真实能力 | ✅ TC-06 |
| 全量 capabilities 覆盖 | ✅ TC-05 |
| schemaVersion=2 / 旧版失效 | ✅ TC-11/TC-11b/TC-15 |
| 注入端写入 capabilities | ✅ TC-14 |
| prev 冻结含 capabilities | ✅ TC-16 |
| 空数组等价 undefined | ✅ TC-12 |

## 四、失败用例分析

无。

## 五、变更前后模型集 diff（回应设计审查 #4）

| Provider | 变更前 | 变更后（预期） | 消失的 id |
|---------|-------|--------------|----------|
| cpa | 22 | 16 | gpt-image-2, gpt-image-2.5, gpt-image-2.5-flare, gpt-image-2.5-sunburst, grok-imagine-image-2.0, gpt-image-1.5* |
| fn | 17 | 12 | 同上五条 + gpt-image-1.5* |

\* `gpt-image-1.5` 仅在 models.dev 不可用（关键词兜底）时消失；正常场景因其 `output:["text","image"]` 应保留。

**实际结果需运行时验证**（见 contract §二）。
