# 测试方案设计 — limit 解析接入 models.dev

## 一、测试分层

| 层 | 目标 | 文件 |
|----|------|------|
| 单元 | `resolveAuthoritativeLimit` 合并语义、边界 | `test/authoritative-limit.test.ts`（新增） |
| 单元 | 缓存格式解析与失败防护 | `test/cache-payload.test.ts`（新增） |
| 集成/端到端 | `index.ts` 扫描路径（resolveProviderModels） | `test/index-scan.test.ts`（新增） |
| 回归 | 原有 20 例全绿（filter 5 / limits-database 8 / v2-catalog 2 / auth-resolver 3 / cache-store 2） | `test/*.test.ts`、`tests/*.test.ts` |

> 全量用例数：55 例 / 8 文件。回归口径为「本次改动前已存在的测试」（20 例），不含本次新增的 3 个文件（35 例）。

## 二、可测性改造

`index.ts` 的 limit 计算内联在异步 IIFE 中，不可测。已抽取 `resolveProviderModels` 纯函数（`src/index.ts`），封装：

```ts
export function resolveProviderModels(
  rawModels: RawOpenAIModel[],
  modelsDevCache: Map<string, ModelsDevModel> | undefined,
  options: { include?, exclude?, rules?, defaultLimit?, smartModelName?, shouldAppendProviderName?, providerName? },
  prevEntries?: CachedModelEntry[]
): CachedModelEntry[];
```

该函数封装：过滤 → `resolveAuthoritativeLimit` → `buildCachedEntry`（失败防护）。setup 扫描循环改为调用它，使其可被单测直接驱动。

## 三、用例与契约映射

| 用例ID | 场景 | 类别 | 前置条件 | 测试步骤 | 预期结果 | 关联契约 |
|-------|------|------|---------|---------|---------|---------|
| TC-01 | luna 权威值 | 正常 | mock cache 含 gpt-5.6-luna=1050000 | 调用 resolveAuthoritativeLimit | context===1050000 | 主路径-1 |
| TC-02 | grok 权威值 | 正常 | mock cache 含 grok-4.7=500000 | 调用 resolveAuthoritativeLimit | context===500000 | 主路径-2 |
| TC-03 | hy4 权威值 | 正常 | mock cache 含 hy4-preview=1024000 | 调用 resolveAuthoritativeLimit | context===1024000 | 主路径-3 |
| TC-04 | 扫描路径端到端 | 正常 | mock 缓存数据 | 调用 resolveProviderModels | context===1050000 | 主路径-4 |
| TC-05 | matchedModelsDev 真 | 正常 | cache 命中且正 limit | 调用 resolveAuthoritativeLimit | true | 主路径-5 |
| TC-06 | 0 值回落 | 边界 | mock {context:0,output:0} | 调用 resolveAuthoritativeLimit | context===rule.context | 边界-1 |
| TC-07 | 空 Map | 异常 | cache=空 Map | 调用 resolveAuthoritativeLimit | 不抛异常，matched=false | 边界-2 |
| TC-08 | 失败防护-保留旧值 | 边界 | 空 Map + prevEntry 有正 context | 调用 buildCachedEntry | 返回 prevEntry | 边界-3 |
| TC-09 | 失败防护-不冻结 | 边界 | 空 Map + prevEntry 不存在 | 调用 buildCachedEntry | 返回规则值 | 边界-3 |
| TC-10 | 旧格式缓存丢弃 | 异常 | 缓存文件为裸数组 | 调用 parseCachedModels | 判定过期，不抛异常 | 边界-4 |
| TC-11 | 新格式缓存读取 | 正常 | 缓存文件 schemaVersion:1 | 调用 parseCachedModels | 正常解出 models | 边界-4 |
| TC-12 | 部分字段回落 | 边界 | mock {context:500000,output:0} | 调用 resolveAuthoritativeLimit | context=500000,output=rule.output | 边界-5 |
| TC-13 | limit 缺失 | 边界 | mock 命中但 limit=undefined | 调用 resolveAuthoritativeLimit | matched=false，全回落 | 边界-6 |
| TC-14 | 回归 limits-database | 回归 | — | bun test | 现有 8 例全绿 | 相邻-1 |
| TC-15 | 回归 v2-catalog | 回归 | — | bun test | 现有 2 例全绿 | 相邻-2 |

## 四、执行命令

```powershell
cd D:\workspace\opencode2-model-resolver
bun test
bunx tsc --noEmit -p tsconfig.json
```

## 五、通过标准

- 新增用例 13 个全绿。
- 现有 19 例全绿。
- 类型检查无错误。
