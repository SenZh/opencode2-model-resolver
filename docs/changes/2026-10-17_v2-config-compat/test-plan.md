# 测试方案 — V2 新格式 provider 配置兼容

## 测试策略

| 层级 | 目标 | 工具 | 隔离方式 |
|------|------|------|---------|
| 单元 | `resolveProviderConfig` / `collectDiscoveryTargets` 等价类/边界/优先级 | `bun test` | 纯函数，无 IO |
| 集成 | 扫描循环端到端（两段驱动、跳过分支） | `bun test` + mock fetch | 临时 `USERPROFILE`/`HOME` 隔离 |
| 集成 | transform 端到端读新格式 config | `bun test` | 临时 home 隔离 |
| 回归 | 既有扫描/缓存/注入行为 | `bun test` | 既有隔离机制 |
| E2E | 真实重启 opencode，扫描闭环 | 读 `runtime.log` + `cpa-models.json` | 用户真实环境，人工触发，结束回滚 plugins |

## 隔离注意事项（沿用 learnings 教训）

- `getHomeDir()` 每次调用读环境变量，`USERPROFILE`/`HOME` 覆盖必须在**模块加载前**生效。
- 集成测试用 `mkdtempSync` 造临时 home，`afterAll` 清理。
- 单元测试不得触碰用户真实 `~/.cache`。
- 扫描集成测试必须 mock `globalThis.fetch`（不得真实请求 `ai.codepower.cloud`）。

## 通过标准

- 单元 + 集成 + 回归：`bun test` 通过率 **100%**，新增用例全部通过。
- E2E：M1-M5 全部命中（需真实重启，人工确认）。

## 覆盖矩阵

| 契约项 | 用例 ID | 层级 |
|-------|--------|------|
| M1 / M2（扫描生效） | E2E-01 | E2E |
| M3（缓存刷新） | E2E-02 | E2E |
| M4（reload） | E2E-03 | E2E |
| M5（展示名） | TC-01 / TC-INJECT-V2 / E2E-02 | 单元+集成+E2E |
| M6（深度相等） | TC-15 | 单元 |
| B1 | TC-02 / TC-10 / TC-SCAN-V1 | 单元+集成 |
| B2 | TC-03 | 单元 |
| B3 | TC-05 / TC-SCAN-SKIP | 单元+集成 |
| B4 | TC-07 | 单元 |
| B5 | TC-08 | 单元 |
| B6 | TC-06 | 单元 |
| B7 | TC-09 / TC-SCAN-ENABLED-FALSE | 单元+集成 |
| B8 | TC-10 | 单元 |
| B9 | TC-12 | 单元 |
| B10 | TC-13 | 单元 |
| B11 | TC-14 | 单元 |
| B12 | TC-16 | 单元 |
| B13 | TC-11 / TC-17 | 单元 |
| 深层字段透传 | TC-04 | 单元 |
| A1（扫描核心） | TC-SCAN-V2 / TC-SCAN-V1 / TC-SCAN-SKIP / TC-SCAN-ENABLED-FALSE | 集成 |
| A2 | TC-INJECT-V1 + REG-02 | 集成+回归 |
| A3 | REG-03 + E2E-02（条目数） | 回归+E2E |
| A4 | 编译 + grep | 静态 |
| A5 | REG-01~REG-04（`bun test` 全量） | 回归 |
