# 产出契约 — V2 新格式 provider 配置兼容

## 主路径（二元条件，跑命令/读文件验证）

| # | 完成标准（可证伪） | 验证方式 |
|---|-------------------|---------|
| M1 | `runtime.log` 中出现 `Discovered provider [cpa] with modelsDiscovery enabled`（时间晚于本次修复重启） | 读 `C:\Users\zjxin\.cache\opencode2-model-resolver\runtime.log` 末尾（E2E-01） |
| M2 | `runtime.log` 中出现 `Fetching [cpa] models from https://ai.codepower.cloud/v1/models...`，随后 `Fetched N raw models for [cpa]`，无 401/403 | 同上（E2E-01） |
| M3 | `cpa-models.json` 的 `updatedAt` 晚于修复重启时刻（不再是 `1792204703881`） | 读 `cpa-models.json`（E2E-02） |
| M4 | `runtime.log` 中出现 `Triggering ctx.provider.reload()` 与 `ctx.provider.reload() finished!` 成对 | 同上（E2E-03） |
| M5 | `cpa-models.json` 中 `name` 后缀为 `(CPA)`（新格式 `providers.cpa.name` 生效） | 读 `cpa-models.json`（E2E-02） |
| M6 | 同值分别写入新旧格式，`resolveProviderConfig` 结果深度相等（除 `source`） | 单测 TC-15 |

## 边界 / 异常（触发条件 + 预期行为）

| # | 触发条件 | 预期行为 | 用例 |
|---|---------|---------|------|
| B1 | 仅旧格式 `provider.<id>.options` 存在 | `source="v1"`，字段解析与修复前一致；扫描路径同样生效 | TC-02 / TC-10 / TC-SCAN-V1 |
| B2 | 两段同 id 且值冲突 | 取新格式（`source="v2"`），与运行时「新覆盖旧」一致 | TC-03 |
| B3 | provider 存在但 `settings` 缺失 | `baseURL=""`，不抛异常；扫描走 skipping 分支且**不发请求** | TC-05 / TC-SCAN-SKIP |
| B4 | `name` 为纯空白 | 回退 `providerId` | TC-07 |
| B5 | `config` 为 `null` | `found=false`，不抛异常 | TC-08 |
| B6 | `baseURL` 带多个尾斜杠 | 全部去除 | TC-06 |
| B7 | `discovery.enabled === false` | 不进入扫描目标集，**不发请求** | TC-09 / TC-SCAN-ENABLED-FALSE |
| B8 | `providers` 段无该 id、`provider` 段有 | `source="v1"` | TC-10 |
| B9 | v2 段有 provider无 discovery、v1 段有 discovery | 整段 v2 优先 → 不生效（与运行时一致） | TC-12 |
| B10 | `providers.<id>` 值为 `null` | `found=false`，不抛异常 | TC-13 |
| B11 | `modelsDiscovery` 为非对象（`true`/字符串） | 视为无 discovery，跳过 | TC-14 |
| B12 | `settings` 无 `apiKey` | 返回 `apiKey=""`，调用方回退 `resolveSystemApiKey` | TC-16 |
| B13 | 两段并存、各有不同 id 启用 discovery | 目标集为并集且去重，v2 项在前 | TC-11 |

## 相邻影响（不被改坏的范围，grep 2+ 处确认）

| # | 范围 | 验证方式 |
|---|------|---------|
| A1 | 扫描循环遍历/解析逻辑（本次改动核心） | TC-SCAN-V2 / TC-SCAN-V1 / TC-SCAN-SKIP / TC-SCAN-ENABLED-FALSE |
| A2 | transform 注入 capabilities/cost/compatibility 不变 | 既有 `test/inject-transform.test.ts` 全部通过（REG-02） |
| A3 | 缓存解析与 schemaVersion 逻辑不变；升级前后 `cpa-models.json` 条目数不清零 | 既有 `test/cache-payload.test.ts`（REG-03）+ E2E-02 条目数 ≥ 32 |
| A4 | `catalog-injector.ts` / `config-injector-v1.ts`（死代码）不受影响 | grep 确认无生产调用点 + 编译通过 |
| A5 | 全量测试套件通过率 100% | `bun test`（REG-01~REG-04） |
