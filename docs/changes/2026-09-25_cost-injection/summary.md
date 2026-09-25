# 变更总结：官方参考成本注入 (Cost Injection)

## 1. 变更目标与成效
本变更解决了 OpenChamber / OpenCode V2 模型详情面板中「成本 ($/100万 TOKENS)」一栏全部展示为 `—` 的问题。
通过引入 `https://models.dev/api.json` 作为权威价格源，并构建高效的预索引表与分层匹配算法，使 CPA / FN 等中转 Provider 下的所有模型均注入了官方原厂参考基准单价。

### 成效对比
| 模型 | 修复前成本展示 | 修复后运行时 cost 数据 |
| :--- | :---: | :--- |
| `gemini-3.8-flash` | `—` | `input: $0.75 / output: $3.75 / cache_read: $0.075` |
| `gpt-5.6-luna` | `—` | `input: $0.20 / output: $1.20 / cache_read: $0.02` |
| `claude-opus-4-6` | `—` | `input: $5.00 / output: $25.00 / cache_read: $0.50 / cache_write: $6.25` |
| `glm-5.3-flash` | `—` | `input: $0.15 / output: $0.50 / cache_read: $0.03` |
| `grok-4.7` | `—` | `input: $2.00 / output: $6.00 / cache_read: $0.50` |
| `grok-4.7-build-fast` | `—` | `input: $2.00 / output: $6.00 / cache_read: $0.50` (前缀继承) |

## 2. 核心架构与关键变更

### 2.1 模块职责与新增
1. **`src/fetcher/models-dev-api.ts` (新增)**：
   - 异步抓取 `https://models.dev/api.json` 并一次性构建 3 张 $O(1)$ 查找字典（官方原厂表、全局精确表、尾段表）及 1 张受单词边界约束的官方前缀候选池。
   - 内存 Promise 单例复用，超时设为 10 秒，失败自动重置自愈。
2. **`src/rules/cost.ts` (新增)**：
   - 实现四级递进匹配策略：官方原厂优先 > 全局精确 > 尾段模型名 > 带单词边界分隔符（`-`, `_`, `:`, `/`）的前缀匹配。
   - 严格拦截非分隔符的非法前缀误伤（如 `model-11` 不会误匹配 `model-1`）。
3. **`src/index.ts` (更新)**：
   - 缓存格式升级至 `CACHE_SCHEMA_VERSION = 3`。
   - 新增 `parseOldCachedModelsForFallback` 兼容读取 `schemaVersion >= 2` 的历史条目，彻底解决跨版本升级遇首次断网时的 limit 防护失效问题。
   - 重构 `buildCachedEntry` 为双数据源独立字段级装配（limit/capabilities 与 cost 相互解耦）。
   - 注入端 transform 严格契合 OpenCode V2 核心 Effect Schema，正确装配 `Model.Info.cost`。

### 2.2 审查与整改闭环
本阶段经过阶段一（架构审查）和阶段二（代码与测试审查）两轮严格双审，共识别并彻底闭环了 5 项核心隐患：
- **P1 - 虚假零值 (Fake Zero)**：`cache.read` 和 `cache.write` 严格按内核 Schema 规范装配，不影响 `input` 与 `output` 单价。
- **P1 - 扫描性能卡顿**：通过预先构建 Map 索引表，将扫描匹配复杂度由 $O(N \times M)$ 降为 $O(1)$。
- **P1 - 跨版本迁移防护**：兼容读取历史有效缓存用于后台扫描断网兜底。
- **P1 - 多源异构装配**：`buildCachedEntry` 真正实现字段级解耦。
- **P1 - 前缀池污染**：前缀池严格限定仅从官方原厂白名单收录，消除第三方托管商抢占与数千项遍历退化。

## 3. 测试与验证数据
- **自动化测试**：总计 **85 项测试全部通过（0 失败，233 个断言）**。
- **静态类型检查**：`bunx tsc --noEmit` 0 错误。
- **打包构建**：`bun run build` 成功。
- **运行时实测**：OpenCode CLI `/api/model` 接口 200 成功返回 39 个模型，CPA 17 个模型 100% 成功注入 `cost` 数组。
