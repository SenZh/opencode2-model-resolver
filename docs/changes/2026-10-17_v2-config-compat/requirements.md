# 需求分析 — V2 新格式 provider 配置兼容

## 用户原始需求全文

1. 「`@zsen/opencode2-model-resolve` 这个插件怎么没有生效，没有刷新，没有拉最新的 models」
2. 「那是不是我们这个插件需要更新一下」
3. 「按工作流执行」

## 背景事实（已取证）

- 用户配置 `C:\Users\zjxin\.config\opencode\opencode.json` 中 `cpa` provider 使用 **V2 新格式**：`providers.cpa.settings.modelsDiscovery`（第 59-72 行）。
- 插件 `@zsen/opencode2-model-resolver` v1.1.0 的扫描入口只读 **V1 旧格式** `provider.<id>.options.modelsDiscovery`（`src/index.ts:383`）。
- 结果：`discovery` 为 `undefined` → `src/index.ts:384` 直接 `continue` → cpa 从不被扫描。
- 后果：`cpa-models.json` 最后一次刷新停在本地 `2026-10-17 10:38:23`（`updatedAt=1792204703881`），此后界面只靠 transform 注入旧缓存，模型列表永不刷新。

## 实现目标（可量化）

| # | 目标 | 可量化验证方式 |
|---|------|---------------|
| G1 | 扫描路径能识别 V2 新格式 `providers.<id>.settings.modelsDiscovery` | `runtime.log` 出现 `Discovered provider [cpa] with modelsDiscovery enabled` |
| G2 | 扫描路径能读取 V2 新格式 `providers.<id>.settings.baseURL` 与 `settings.apiKey` | `runtime.log` 出现 `Fetching [cpa] models from https://ai.codepower.cloud/v1/models...` 且 `Fetched N raw models`，无 401/403 |
| G3 | 注入端 transform 能读取 V2 新格式 provider 展示名 | `showProviderName=true` 时 `cpa-models.json` 的 `name` 后缀为 `(CPA)`（取自 `providers.cpa.name`） |
| G4 | V1 旧格式 `provider.<id>.options.*` 行为不回归 | 现有全部单测通过 + 新增旧格式等价类用例通过 |
| G5 | 缓存格式不破坏，已有缓存不丢 | `CACHE_SCHEMA_VERSION` 仍为 3；升级后 `cpa-models.json` 的 `models` 数量不因版本失效而清零 |
| G6 | `modelsDiscovery` 配置项在两种格式下语义一致 | 新旧格式解析结果深度相等（单测 TC-15 断言 `toEqual`） |

## 非目标（本次不做）

- 不改缓存 schema（`schemaVersion` 保持 3）。
- 不改 `modelsDiscovery` 配置项本身的语义。
- 不处理 `disabled_providers` 与 transform 注入的关系（记为遗留问题）。
- 不处理 `settings.modelsDiscovery` 被运行时透传给 AI SDK 的问题（记为遗留问题）。

## 验收基准

- `contract.md` 的每一条完成标准均可通过「跑命令 / 读文件 / 单测」证伪。
- 需求 G1-G6 在 Phase 3 逐条核验。
