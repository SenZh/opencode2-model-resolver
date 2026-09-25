# 产出契约 — limit 解析接入 models.dev

## 一、完成标准（可证伪）

| 场景 | 完成标准（可证伪） | 验证方式 |
|------|-------------------|---------|
| **主路径-1** | `resolveAuthoritativeLimit({id:"gpt-5.6-luna"}, {modelsDevCache: 真实数据})` 返回 `context === 1050000` | 单测断言 |
| **主路径-2** | `resolveAuthoritativeLimit({id:"grok-4.7"}, {modelsDevCache: 真实数据})` 返回 `context === 500000` | 单测断言 |
| **主路径-3** | `resolveAuthoritativeLimit({id:"hy4-preview"}, {modelsDevCache: 真实数据})` 返回 `context === 1024000` | 单测断言 |
| **主路径-4** | `index.ts` 扫描路径：mock `fetchModelsDevData` 返回含 `gpt-5.6-luna` 的 Map（context=1050000），执行扫描后写入缓存的该模型 `limit.context === 1050000` | 集成单测（行为断言，非 grep） |
| **主路径-5** | `matchedModelsDev === true` 当 models.dev 命中且有正 limit；`false` 当未命中或 limit 缺失 | 单测断言 |
| **边界-1** | models.dev 中 `context: 0` 的模型，结果采用规则值（0 视为无效） | 单测：mock `{context:0,output:0}`，断言 context === rule.context |
| **边界-2** | `modelsDevCache` 空 Map 或 undefined 时，函数不抛异常，返回 `resolveModelLimit` 的输出，`matchedModelsDev === false` | 单测断言 |
| **边界-3** | 本次无权威值（models.dev 未命中）**且**旧缓存已有该模型时，保留旧值；旧缓存**无**该模型时，仍写入规则值（不冻结） | 单测：两种情形分别断言 |
| **边界-4** | 读取旧格式（裸数组）缓存时被判定为过期并丢弃且不抛异常；读取新格式（`schemaVersion:1`）正常注入 | 单测断言 |
| **边界-5** | models.dev 命中 context=500000 但 output=0 时，context 采用 500000、output 回落规则值 | 单测断言 |
| **边界-6** | models.dev 命中但 `limit` 字段整个缺失时，`matchedModelsDev === false`，全字段回落规则值 | 单测断言 |
| **相邻-1** | `resolveModelLimit` 签名与行为不变，现有 `test/limits-database.test.ts` 8 例全绿 | `bun test` |
| **相邻-2** | `catalog-injector.ts`（V2）改用新函数后，`test/v2-catalog.test.ts` 2 例全绿，且其中一例断言 655360（区别于规则值 131072）证明 models.dev 层生效 | `bun test` |
| **相邻-3** | 全量测试通过率 100%（55 例 / 8 文件） | `bun test` 汇总 |

> 注：`config-injector-v1.ts`（V1）无生产调用点（`index.ts` 不 import），亦无独立测试，本次同步改用新函数但仅靠类型检查守护。已记为遗留问题。

## 二、验证命令

```powershell
cd D:\workspace\opencode2-model-resolver
bun test                    # 期望全绿，含新增用例
bunx tsc --noEmit -p tsconfig.json   # 类型检查通过
```

## 三、相邻影响范围（不被改坏）

1. `resolveModelLimit` 的 5 个分支行为（customRules / 服务端字段 / 名称内嵌数字 / 规则库 / 兜底）——被 `limits-database.test.ts` 8 例守护。
2. `shouldIncludeModel` / `formatSmartModelName` 过滤与命名——本次不触碰。
3. `modelCacheStore` 的 `{pid}.json` 格式——本次不改变其签名，仅调用点改用新函数。
4. `index.ts` 同步 transform 冷启动路径——本次**不改**其查询来源（仍只读缓存），仅改读取兼容。

## 四、显式行为变更声明

| 变更 | 变更前 | 变更后 | 影响 |
|------|--------|--------|------|
| `gpt-image-*` 等 models.dev 值为 0 的模型 | context=131072（FALLBACK 兜底） | 不变，仍为 131072（0 视为无效 → 回落规则 → 无规则命中 → FALLBACK） | 无变化 |
| 缓存文件格式 | 裸数组 | `{schemaVersion,updatedAt,models}` | 旧缓存被丢弃，下次扫描重建 |
