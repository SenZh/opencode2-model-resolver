# 测试结果 — limit 解析接入 models.dev

## 一、执行汇总

| 总用例数 | 通过 | 失败 | 跳过 | 通过率 |
|---------|------|------|------|-------|
| 55 | 55 | 0 | 0 | 100% |

执行命令：`bun test` → `Ran 55 tests across 8 files`
类型检查：`bunx tsc --noEmit -p tsconfig.json` → 0 错误

## 二、分文件明细

| 文件 | 用例数 | 结果 |
|------|-------|------|
| test/authoritative-limit.test.ts | 13 | 全通过（新增） |
| test/cache-payload.test.ts | 15 | 全通过（新增） |
| test/index-scan.test.ts | 7 | 全通过（新增，端到端） |
| test/limits-database.test.ts | 8 | 全通过（回归） |
| test/filter.test.ts | 5 | 全通过（回归） |
| test/v2-catalog.test.ts | 2 | 全通过（回归，已强化为证明 models.dev 层生效） |
| tests/auth-resolver.test.ts | 3 | 全通过（回归） |
| tests/cache-store.test.ts | 2 | 全通过（回归，已强化隔离） |
| **合计** | **55** | **全通过** |

## 三、关键验证

| 验证项 | 结果 |
|-------|------|
| gpt-5.6-luna → 1050000 | ✅ TC-01 / 主路径-4 |
| grok-4.7 → 500000 | ✅ TC-02 / 主路径-4 |
| hy4-preview → 1024000 | ✅ TC-03 / 主路径-4 |
| models.dev 0 值不被吞 | ✅ TC-06 |
| models.dev 不可用保护旧值 | ✅ TC-08 |
| models.dev 可用不冻结 | ✅ P0-回归 |
| context=0/output>0 判定 | ✅ P1-回归 |
| 旧缓存 output=0 不固化 | ✅ P1-回归（cache-payload + index-scan） |
| 旧缓存格式丢弃 | ✅ TC-10 |
| models.dev 层在 v2 路径生效 | ✅ 655360 ≠ 规则值 131072 |
| 测试不再污染真实缓存目录 | ✅ 运行前后目录无变化 |
| 现有回归用例无破坏 | ✅ filter 5 + limits-database 8 + v2-catalog 2 + auth-resolver 3 + cache-store 2 |

## 四、断言有效性验证（变异测试）

| 变异操作 | 预期 | 实际 |
|---------|------|------|
| 移除 buildCachedEntry 的 `prev.limit.output > 0` | 相关用例失败 | ✅ 2 例失败 |
| 将 models.dev devInfo 强制置 undefined | v2-catalog 断言失败 | ✅ Expected 655360 / Received 131072 |

失败用例分析：无。
