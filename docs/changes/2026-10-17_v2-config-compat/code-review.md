# 代码审查 — V2 新格式 provider 配置兼容

## 一、主 agent 自审

| 审查项 | 结论 | 说明 |
|-------|------|------|
| 功能正确性 | ✅ | `resolveProviderConfig` 严格按 v2→v1→none 顺序；`collectDiscoveryTargets` 去重/顺序/过滤与 2.1 规则一致 |
| 设计遵循 | ✅ | C1-C6 全部落实，`git diff` 无设计外改动 |
| 边界覆盖 | ✅ | contract B1-B13 全部处理 |
| 向后兼容 | ⚠️ | V1 transform 路径逐行等价；扫描路径 3 处差异中 2 处为隐性改进（已补声明），1 处为设计要求收紧 |
| 类型安全 | ⚠️ | 首版有 `as ModelsDiscoveryConfig` 不安全断言与 `discovery!` 非空断言（后修复） |
| 测试充分性 | ⚠️ | 首版新增 transform 用例未 mock fetch，触发真实网络（后修复） |
| 并发/时序 | ⚠️ | 首版集成测试轮询按请求总数，机制失效（后改哨兵） |

## 二、sub-agent 独立审查

**审查者**：`review` subagent（独立上下文，已实际打开源码与文档，逐行 diff 核对）
**审查结论**：有条件通过（生产代码 C1-C6 无阻断，测试层 4 个中等问题需修复）

### 审查问题清单

| # | 类型 | 问题描述 | 引用位置 | 严重度 | 是否解决 | 解决方式 |
|---|------|---------|---------|--------|---------|---------|
| 1 | 测试遗漏 | 新增 transform 用例写含 baseURL 的 config 后调 `plugin.setup` 却未 mock fetch，触发真实网络请求，违反隔离铁律 | `test/inject-transform.test.ts:233-240,253-254`；`src/index.ts:363-372,382,410` | 中 | ✅ | `injectWithConfig` 内 mock `globalThis.fetch`，`finally` 恢复 |
| 2 | 设计偏离/覆盖不足 | V1 旧格式 `modelsDiscovery` 为非对象时行为收紧（旧为「继续扫描」，新为「跳过」），与 2.4「不改语义」有张力且未声明、无 V1 用例 | `src/rules/provider-config.ts:101-103`；`tech-design.md:69,100` | 中 | ✅ | 2.3 补行为变更声明；新增 TC-14b（V1 等价类） |
| 3 | 覆盖不足 | apiKey 回退链（`apiKey \|\| resolveSystemApiKey`）无测试守护 | `src/index.ts:388` | 中 | ✅ | 新增 TC-SCAN-APIKEY-FALLBACK（临时 auth.json 断言 Authorization 头） |
| 4 | 测试遗漏/时序 | 轮询条件按请求总数，`expectRequests=1` 恒满足、`=0` 不等待；`finally` 恢复 fetch 时机可能泄漏真实网络 | `test/index-scan-integration.test.ts:68-78,107-111` | 中 | ✅ | 改用**哨兵 provider**作为「扫描已到末尾」确定性信号；`beforeEach` 重置模块级缓存 |
| 5 | 测试遗漏 | TC-SCAN-SKIP/ENABLED-FALSE 弱断言，无法区分「正确跳过」与「未执行」 | `test/index-scan-integration.test.ts:156-192` | 低 | ✅ | 哨兵机制使「扫描已执行到末尾」成为前置确定性事实 |
| 6 | 测试遗漏 | test-cases.md 未定义 9 个已实现用例，文档与实现不一致 | `test-cases.md` | 低 | ✅ | 补齐 TC-07b/08b/09b/13b/14b/18/19/20/21/22 + TC-SCAN-DISPLAY/V2-NONDISCOVERY/APIKEY-FALLBACK |
| 7 | 测试遗漏 | TC-11 描述「2 项」与实现「3 项」不符 | `test-cases.md:19` | 低 | ✅ | 修正为 3 项 `["a","shared","b"]` |
| 8 | 测试遗漏 | 集成测试未重置 models-dev 模块级单例，存在跨文件顺序依赖 | `test/index-scan-integration.test.ts:1-31` | 低 | ✅ | `beforeEach` 调 `__resetModelsDevCacheForTest()` / `__resetModelsDevApiCacheForTest()` |
| 9 | 代码质量 | `providerConfig.discovery!` 非空断言依赖实现契约 | `src/index.ts:383` | 低 | ✅ | `collectDiscoveryTargets` 返回类型中 `discovery` 改为非可选，循环解构直接取用 |
| 10 | 代码质量 | `as ModelsDiscoveryConfig` 未做字段级校验，脏类型透传 | `src/rules/provider-config.ts:84-86,101-103` | 低 | ✅ | 新增 `pickDiscoveryConfig` 逐字段类型守卫；TC-21 覆盖 |
| 11 | 代码质量 | `ModelsDiscoveryConfig` 与 `PluginOptions` 字段重复 | `src/rules/provider-config.ts:6-19`；`src/types.ts:34-89` | 低 | ⏸️ | 留作遗留（重构涉及死代码 `PluginOptions`，超出本次范围） |
| 12 | 代码质量 | `found` / `source` 无生产消费点 | `src/rules/provider-config.ts:30-43` | 低 | ✅ | 扫描日志新增 `Provider [id] config source: {source}` |
| 13 | 覆盖不足 | V1 非字符串 baseURL/apiKey 行为变更未声明无测试 | `src/index.ts:388-389` | 低 | ✅ | 2.3 补声明；新增 TC-22 |
| 14 | 代码质量 | `os.homedir = () => tmpHome` 在 ESM 命名空间赋值无效，误导性冗余 | `test/index-scan-integration.test.ts:14` | 低 | ✅ | 移除该行，仅保留 `USERPROFILE`/`HOME` 覆盖 |

**严重度分布**：高 0 / 中 4 / 低 10。

## 三、主 agent 裁决

### 3.1 差异点仲裁

| 差异点 | 自审结论 | sub-agent 结论 | 仲裁 |
|-------|---------|---------------|------|
| 生产代码是否阻断 | 自审认为「C1-C6 落实即通过」 | 「无阻断，但有 2 处未声明语义变更」 | **采纳 sub-agent**。#2/#13 已补声明与用例，使「不改动项」与实现一致 |
| 测试隔离 | 自审未发现 fetch 泄漏 | 中（违反隔离铁律） | **采纳 sub-agent**。确认 `injectWithConfig` 确实会触发真实请求，已修复 |
| 轮询机制 | 自审认为「轮询+200ms 兜底足够」 | 中（轮询形同虚设） | **采纳 sub-agent**。原 `expectRequests` 计数含 models.dev 请求，已改哨兵 |
| 类型断言安全性 | 自审认为「`settings!` 逻辑成立即安全」 | 低（`as` 未校验字段） | **采纳 sub-agent**。`settings!` 确实安全，但 `as` 未校验，已加 `pickDiscoveryConfig` |

无「主 agent 正确而 sub-agent 误判」的情形。唯一保留项 #11 属重构建议，涉及死代码模块，记为遗留。

### 3.2 审查质量校验

| 校验项 | 结果 | 说明 |
|-------|------|------|
| 每个发现是否有引用位置 | ✅ | 14 条全部含文件:行号 |
| 维度覆盖是否完整 | ✅ | 8 个维度逐条给出结论与理由，含「V1 路径逐行 diff 等价性表」 |
| 严重度分布是否合理 | ✅ | 高 0 / 中 4 / 低 10 |
| 是否独立分析而非复述 | ✅ | 逐行 diff 发现 3 处行为变更（#2/#13）、grep 确认 fetch 未 mock（#1），非复述可得 |

**审查有效**，无「审查质量不合格」项。

### 3.3 裁决结论

**通过。** 4 个中等问题（#1-#4）与 10 个低问题中 9 个已解决，#11 记为遗留。生产代码 C1-C6 经确认无阻断缺陷。

**⛔ 门禁：代码审查通过。**
