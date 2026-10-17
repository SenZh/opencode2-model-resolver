# 测试用例清单 — V2 新格式 provider 配置兼容

## 一、单元测试（`test/provider-config.test.ts` 新增）

被测函数：`resolveProviderConfig(providerId, config)`、`collectDiscoveryTargets(config)`

| 用例ID | 场景 | 类别 | 前置条件 | 测试步骤 | 预期结果 | 关联产出契约 |
|-------|------|------|---------|---------|---------|------------|
| TC-01 | 新格式全字段解析 | 正常 | config 含 `providers.p = {name:"CPA", settings:{baseURL:"https://a.com/v1", apiKey:"sk-x", modelsDiscovery:{enabled:true,...}}}` | 调 `resolveProviderConfig("p", config)` | `found=true`、`source="v2"`、`baseURL="https://a.com/v1"`、`apiKey="sk-x"`、`name="CPA"`、`discovery.enabled===true` | M5 / G3 |
| TC-02 | 旧格式全字段解析（等价类对照） | 正常 | config 含 `provider.p = {name:"CPA", options:{baseURL:"https://a.com/v1", apiKey:"sk-x", modelsDiscovery:{enabled:true,...}}}` | 同上 | `source="v1"`，其余字段与 TC-01 完全一致 | B1 / G4 |
| TC-03 | 两段同 id 且值冲突 | 边界 | 两段均有 `p`，baseURL 不同（新 `https://new`、旧 `https://old`） | 同上 | `source="v2"`、`baseURL="https://new"` | B2 / G6 |
| TC-04 | 新格式深层字段透传 | 正常 | `settings.modelsDiscovery` 含 `endpoint/include/exclude/rules/defaultLimit/smartModelName/modelInfoFormat/timeoutMs` | 同上 | `discovery` 各字段逐一 `toEqual` 输入值，无丢失无改写 | 主路径 |
| TC-05 | provider 存在但 settings 缺失 | 边界 | `providers.p = {name:"X"}`（无 settings） | 同上 | `found=true`、`baseURL=""`、`apiKey=""`、`discovery===undefined` | B3 |
| TC-06 | baseURL 多个尾斜杠 | 边界 | `baseURL="https://a.com/v1///"` | 同上 | `baseURL="https://a.com/v1"` | B6 |
| TC-07 | name 为纯空白 | 边界 | `name="   "` | 同上 | `name="p"`（回退 providerId） | B4 |
| TC-08 | config 为 null | 异常 | `config=null` | 同上 | `found=false`、`source="none"`、不抛异常 | B5 |
| TC-09 | enabled 显式 false | 边界 | `settings.modelsDiscovery.enabled=false` | `collectDiscoveryTargets(config)` | 返回空数组（该 provider 被过滤） | B7 |
| TC-10 | 仅旧格式存在该 id | 边界 | 仅 `provider.p` 有，`providers` 段无 | `resolveProviderConfig("p", config)` | `source="v1"` | B8 |
| TC-11 | 两段并存时 targets 去重且并集 | 正常 | `providers.{a,shared}`、`provider.{b,shared}` 均启用 discovery | `collectDiscoveryTargets(config)` | 返回 3 项，顺序 `["a","shared","b"]`，`shared` 取 v2 | C3 / B13 |
| TC-12 | v2 段有 provider 但无 discovery，v1 段有 discovery | 边界 | `providers.p={name:"X"}`、`provider.p.options.modelsDiscovery={enabled:true}` | `collectDiscoveryTargets(config)` | 返回空数组（整段 v2 优先，与运行时「新覆盖旧」一致，v1 discovery 不生效） | B9 |
| TC-13 | provider 值为 null | 异常 | `providers.p = null` | `resolveProviderConfig("p", config)` | `found=false`、不抛异常 | B10 |
| TC-13b | providers/provider 段本身为 null 或非对象 | 异常 | `{providers:null}`、`{providers:"x"}` | `resolveProviderConfig("p", config)` | `found=false`、不抛异常 | B10 |
| TC-14 | modelsDiscovery 为非对象 | 异常 | `settings.modelsDiscovery` 依次取 `true`/`"yes"`/`42`/`["a"]`/`null` | `resolveProviderConfig` + `collectDiscoveryTargets` | `discovery===undefined`；目标集为空（跳过） | B11 |
| TC-15 | G6 深度相等断言 | 正常 | 同值分别写入新旧格式 | 两次 `resolveProviderConfig` 结果 | `expect(v2).toEqual(v1)`（除 `source` 外全等） | M6 / G6 |
| TC-16 | settings 无 apiKey 时不臆造 | 边界 | `providers.p.settings` 无 apiKey | `resolveProviderConfig` | `apiKey=""`（回退由调用方负责，纯函数不读 IO） | B12 |
| TC-17 | 无 discovery 的 provider 不产生 target | 正常 | `providers.p.settings = {baseURL:"..."}` 无 modelsDiscovery | `collectDiscoveryTargets(config)` | 返回空数组 | C3 |
| TC-07b | name 为非字符串 | 边界 | `name = 123` | `resolveProviderConfig` | `name` 回退 `providerId` | B4 |
| TC-08b | config 为非对象 | 异常 | `config = "not-json"` / `[1,2]` | `resolveProviderConfig` | `found=false`、不抛异常 | B5 |
| TC-09b | enabled 缺省视为启用 | 正常 | `modelsDiscovery = {}`（无 enabled） | `collectDiscoveryTargets` | 该 provider 进入目标集 | B7 |
| TC-18 | 空配置对象 | 边界 | `{}` / `null` | `collectDiscoveryTargets` | 返回空数组 | 边界 |
| TC-19 | 新格式 provider 无 name | 边界 | `providers.my-prov` 无 name | `resolveProviderConfig` | `name` 回退 `providerId` | B4 |
| TC-20 | 真实用户配置形态可解析 | 正常 | 用户 `opencode.json` 的 cpa 新格式段原文 | `collectDiscoveryTargets` | 1 项，`providerId="cpa"`、`baseURL="https://ai.codepower.cloud/v1"`、`name="CPA"`、`showProviderName=true` | 主路径 |

## 二、集成测试（`test/inject-transform.test.ts` 扩展 + `test/index-scan-integration.test.ts` 新增）

| 用例ID | 场景 | 类别 | 前置条件 | 测试步骤 | 预期结果 | 关联产出契约 |
|-------|------|------|---------|---------|---------|------------|
| TC-INJECT-V2 | transform 读新格式 config 生效展示名 | 正常 | 临时 home 内 `opencode.json` 用 `providers.test-provider.settings.modelsDiscovery.showProviderName=true`、`providers.test-provider.name="TestProv"`；预置缓存 | `plugin.setup(mockCtx)` → 触发 transform | 注入模型 `name` 后缀为 `(TestProv)` | M5 / C2 |
| TC-INJECT-V1 | transform 读旧格式 config 不回归 | 正常 | 同上但用 `provider.test-provider.options` | 同上 | 后缀同为 `(TestProv)` | B1 / G4 |
| TC-SCAN-V2 | 扫描路径用新格式 settings 驱动 | 正常 | 临时 home 内 `opencode.json` 用新格式；mock fetch 返回 2 个模型；追加哨兵 provider | `plugin.setup(mockCtx)` → 轮询等哨兵请求 | 捕获请求 URL = `https://v2.example.com/v1/models`、`Authorization` 正确；写出 `{id}-models.json` 含 2 条、`schemaVersion=3` | M2 / C4 / C5 / C6 |
| TC-SCAN-V1 | 扫描路径用旧格式驱动不回归 | 正常 | 同上但用旧格式 | 同上 | 行为与 TC-SCAN-V2 一致 | B1 |
| TC-SCAN-SKIP | settings 缺失时跳过不崩溃 | 异常 | 新格式 provider 无 `settings.baseURL` | 同上（哨兵出现即扫描已执行完） | 无请求发出，无缓存写出，无异常 | B3 / C5 |
| TC-SCAN-ENABLED-FALSE | enabled=false 时跳过 | 边界 | `modelsDiscovery.enabled=false` | 同上 | 无请求发出 | B7 / C4 |
| TC-SCAN-DISPLAY | 新格式展示名后缀生效 | 正常 | `name="MyProv"`、`showProviderName=true` | 同上 | 写出缓存首条 `name` = `Grok 4.7 (MyProv)` | M5 / C6 |
| TC-SCAN-V2-NONDISCOVERY | v2 段无 discovery、v1 段有 | 边界 | 两段同 id，仅 v1 有 discovery | 同上 | 该 provider 不发请求（整段 v2 优先） | B9 / C3 |
| TC-SCAN-APIKEY-FALLBACK | settings 无 apiKey 时回退 auth.json | 边界 | 临时 `auth.json` 有该 provider 的 key，settings 无 apiKey | 同上 | 捕获 `Authorization` = `Bearer sk-from-auth` | B12 / C5 |

> 集成测试必须 mock `globalThis.fetch`（含 models.dev 拉取），并隔离 `USERPROFILE`/`HOME`（`mkdtempSync`），确保不触碰用户真实环境。等待策略用**哨兵 provider**（每个用例自动追加 `__sentinel__`）作为「扫描已执行到末尾」的确定性信号，不用请求总数（models.dev 请求会先发生，按总数会误判）。`beforeEach` 调用 `__resetModelsDevCacheForTest()` / `__resetModelsDevApiCacheForTest()` 清空模块级单例。

## 三、E2E 用例（真实环境，人工触发）

分发方式：**本地 file:// 加载优先验证**（`plugins: ["file:///D:/workspace/opencode2-model-resolver"]`），验证通过后再走 npm 发布。理由见 `tech-design.md` P6。

| 用例ID | 场景 | 类别 | 前置条件 | 测试步骤 | 预期结果 | 关联产出契约 |
|-------|------|------|---------|---------|---------|------------|
| E2E-01 | 扫描闭环恢复 | 正常 | `bun run build` 产出新 dist；`opencode.json` 的 `plugins` 临时指向 `file:///D:/workspace/opencode2-model-resolver`；记录重启前 `cpa-models.json.updatedAt` | 1. 重启 opencode；2. 轮询 `runtime.log`（最多 90s，间隔 5s）直到出现 `Discovered provider [cpa]` | 日志出现 `Discovered provider [cpa] with modelsDiscovery enabled` + `Fetching [cpa] models from https://ai.codepower.cloud/v1/models...` + `Fetched N raw models for [cpa]`，无 401/403 | M1 / M2 |
| E2E-02 | 缓存刷新与展示名 | 正常 | 承接 E2E-01 | 读 `cpa-models.json` | `updatedAt` 晚于重启前值；首条 `name` 后缀为 `(CPA)` | M3 / M5 |
| E2E-03 | reload 触发 | 正常 | 承接 E2E-01 | 读 `runtime.log` | 出现 `Triggering ctx.provider.reload()` 与 `ctx.provider.reload() finished!` 成对 | M4 |

数据清理：E2E 结束后把 `plugins` 改回 `@zsen/opencode2-model-resolver`（npm 包名），保留 `cpa-models.json`（刷新结果即修复成果，不清理）。

## 四、回归测试（既有套件，零改动）

| 用例ID | 场景 | 关联产出契约 |
|-------|------|------------|
| REG-01 | `test/index-scan.test.ts` 全部通过 | A1 |
| REG-02 | `test/inject-transform.test.ts` 既有用例全部通过 | A2 |
| REG-03 | `test/cache-payload.test.ts` 全部通过 | A3 |
| REG-04 | `test/limits-database.test.ts`、`test/cost.test.ts`、`test/capabilities.test.ts`、`test/filter.test.ts`、`test/authoritative-limit.test.ts`、`tests/*.test.ts` 全部通过 | A5 |
