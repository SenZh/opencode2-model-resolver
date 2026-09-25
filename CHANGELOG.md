# 更新日志 (Changelog)

所有重要的架构改进、Bug 修复和新特性均记录在此文件中。

---

## [v1.1.0] - 2026-09-25

### 🚀 新特性与重大改进 (Features)
- **接入 models.dev/api.json 官方参考定价**：
  - 自动为 CPA / FN 等中转 Provider 下的全部模型注入官方原厂基准定价（美金 / 百万 tokens）。
  - OpenChamber / OpenCode V2 模型详情面板中的「成本 ($/100万 TOKENS)」一栏（Input / Output / Cache read / Cache write）由 `—` 变为精准呈现。
  - 构建预索引表（官方原厂表、全局表、尾段表），将 8,179 个模型的价格匹配复杂度从 $O(N \times M)$ 优化为严格 $O(1)$，扫描过程零卡顿。
  - 严格限定前缀候选池仅收录官方原厂白名单，杜绝第三方加价代理抢占前缀，并强制要求单词边界分隔符（`-`, `_`, `:`, `/`）防范错挂误伤。
- **模型推理能力与思考档位 (Reasoning & Variants) 深度打通**：
  - 修复 OpenChamber 界面上模型推理思考能力缺失（R 图标置灰）的根本缺陷：注入端针对推理模型规范装配 `compatibility.reasoningField = "reasoning_content"`。
  - 自动为所有推理模型装配标准推理档位（`variants`）：
    - `none`: 关闭思考 (`thinking: { type: "disabled" }`)
    - `low`: 轻度思考 (`reasoningEffort: "low"`, `thinking: { type: "enabled" }`)
    - `high`: 深度思考 (`reasoningEffort: "high"`, `thinking: { type: "enabled" }`)
    - `max`: 极深思考 (`reasoningEffort: "max"`, `thinking: { type: "enabled" }`)
  - 既有配置最高优先级保护：用户或上游已显式定义的 `reasoningField`（如 `"thought"`）和 `variants` 绝不发生篡改。
- **精准多模态与生图模型过滤**：
  - 重构过滤判据为「模态优先 + 关键词兜底」：利用 `modalities.output` 精准过滤纯生图/音频模型（如 `gpt-image-2`、`flux`），同时安全保留能对话的多模态模型（如 `gemini-3.1-flash-image`、`gpt-image-1.5`）。
  - 完整补齐 OpenCode V2 核心契约中的 `capabilities` 结构（`tools`, `input`, `output`）。

### 🛡️ 架构稳定性与容灾 (Reliability & Safety)
- **缓存升级为 schemaVersion: 3**：
  - 支持多数据源（限额/能力 vs 价格）独立字段级装配（`buildCachedEntry`），两源一成一败时互不覆盖踩踏。
  - 新增 `parseOldCachedModelsForFallback` 兼容读取历史 `schemaVersion >= 2` 缓存，升级后首次后台扫描遇断网时，已固化的权威上下文限额依然得到 100% 保护。
- **协议兼容性防御**：
  - 严格契合 OpenCode V2 核心 Effect Schema，`cache` 结构同时满足 `read` 与 `write` 必填约束，杜绝 API 400 校验拦截。
- **测试工程化**：
  - 单元与集成测试套件提升至 **86 项全部通过（0 失败，240 个断言）**，实现跨版本迁移、双源异构失败、边界误伤防护 100% 覆盖。

---

## [v1.0.4] - 2026-09-24

### 🐛 Bug 修复 (Fixes)
- 修复 `src/index.ts` 扫描路径未接入 `models.dev` 权威数据库导致 `gpt-5.6-luna`、`grok-4.7`、`hy4-preview` 等模型上下文限额被错误归一为 131,072 的问题。
- 新增 `resolveAuthoritativeLimit` 权威限额合并函数（三级匹配 + 字段级回落）。
- 缓存引入 `schemaVersion: 2` 与字段级失败防护机制。

---

## [v1.0.3] - 2026-09-20

### 🚀 特性 (Features)
- 支持通过 `showProviderName` / `appendProviderName` 在模型展示名后追加 `(ProviderName)` 标识，底层模型 ID 保持稳定。
- 优化 OpenAI 兼容 Provider 的自动发现与凭据解析。

---

## [v1.0.2] - 2026-09-15

### 🚀 特性 (Features)
- 初始版本发布，专为 OpenCode 2 设计的动态模型扫描与上下文限额智能注入。
- 支持读取系统级凭据 `auth.json`。
- 本地独立文件缓存与后台静默刷新。
