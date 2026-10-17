# 分析 — V2 新格式 provider 配置兼容

## 1. 事实清单（每条绑定证据）

| # | 事实 | 证据来源 |
|---|------|---------|
| F1 | 插件 v1.1.0 扫描入口只读 `provider.<id>.options.modelsDiscovery` | `src/index.ts:383`；线上包 `...\1790344607551\...\dist\index.js:288` |
| F2 | 用户 `cpa` 配置在 `providers.<id>.settings.modelsDiscovery` | `C:\Users\zjxin\.config\opencode\opencode.json:59-72` |
| F3 | `discovery` 为 undefined 时直接 `continue`，provider 被跳过 | `src/index.ts:384-386` |
| F4 | 最后一次成功抓取 cpa 在本地 `2026-10-17 10:38:23` | `cpa-models.json.updatedAt=1792204703881`；`runtime.log` 最后 `Fetching [cpa]` = `2026-10-17T02:38:23.639Z` |
| F5 | `opencode.json` 修改时间 `11:46:53`，晚于 F4，且备份中 cpa 曾在旧格式 | `opencode.json.openchamber.backup`（09:38）含 `provider.cpa.options.modelsDiscovery` |
| F6 | 11:46 之后 setup 段无 `Discovered provider [cpa]` 行 | `runtime.log` 最后 60 行 |
| F7 | V2 新格式 = `providers.<id>.settings`（旧 = `provider.<id>.options`），`package`↔`npm` | 线上 schema `https://opencode.ai/config.json`；`Config.ProviderEncoded.settings` |
| F8 | `providers` 复数段的 key 即运行时 providerID | `opencode.exe` 偏移 145847197：`D.update(te, ...)`，`te` 为 key |
| F9 | `settings.baseURL` / `settings.apiKey` 确实被运行时消费 | `opencode.exe` 偏移 145037000（`...e.settings??{}`）、145849668（`settings?.apiKey`） |
| F10 | 新格式 provider 会进入 `provider.transform` 回调对象；同 id 两段合并方向为**新覆盖旧** | `opencode.exe` 偏移 145552179（`_x` 读 `info.providers`）、145233900 `Hs(i,"providers",J,R,...)`、145243542 `Md` 以旧段为基底遍历新段覆写 |
| F11 | 旧格式 `provider` 段已 `deprecated: true`，但仍被合并读取 | schema 行 731-738；`opencode.exe` 偏移 145233865 `bx(e.provider,r)` |
| F12 | transform 注入不依赖配置格式，`providers.models.update(id,...)` 直接命中注册表 | `src/index.ts:301`；`opencode.exe` 偏移 145034311 |
| F13 | 线上安装版本为 1.1.0，源码 `package.json` 亦为 1.1.0 | `...\1790344607551\...\package.json:3`；`D:\...\package.json:3` |
| F14 | 注入端 transform 读 `config.provider[providerId].name` 决定 provider 展示名；`showProviderName` 另读 `options.modelsDiscovery.showProviderName` | `src/index.ts:293-294`（showProviderName 取源）、`:295-298`（providerName 取源） |
| F15 | `disabled_providers` 命中项被 policy 插件从 transform 列表中移除 | `opencode.exe` 偏移 145552576 `s.remove(A.provider.id)` |

## 2. 推断清单（每条绑定事实凭据）

| # | 推断 | 依据事实 | 置信度 |
|---|------|---------|-------|
| I1 | 「没有刷新」的直接原因是扫描循环跳过 cpa，而非网络失败或 reload 失效 | F1+F2+F3+F6；反证：`runtime.log` 中 reload 历史 2094 次 `Triggering` 全部伴随 `finished!` 无异常 | 高（已由 F6 正面证实） |
| I2 | 把 cpa 配置挪回旧格式段即可临时恢复，但治标不治本 | F11（旧格式仍被读取） | 高 |
| I3 | 修复需覆盖 4 处配置读取点：扫描 discovery / baseURL / apiKey + transform providerName | F1+F9+F14 | 高 |
| I4 | transform 注入的缓存注入路径本身在新格式下仍可用 | F12（注入只用缓存 + providerID，不读 provider 配置；仅 `showProviderName` 依赖配置） | 高 |
| I5 | 缓存无需升级 schemaVersion | 修复只改配置读取来源，不改缓存结构；F13 | 高 |

## 3. 现状与目标差距

| 维度 | 现状 | 目标 | 差距 |
|------|------|------|------|
| 配置读取 | 仅旧格式 `provider.options` | 新旧双格式，新优先 | 需新增解析函数 |
| 扫描生效 | cpa 被跳过 | cpa 正常扫描刷新 | 同上 |
| 展示名 | 新格式 providerName 取不到 | 正确取 `providers.<id>.name` | 需改 transform 读取 |
| 兼容性 | 旧格式可用 | 旧格式不回归 | 需等价类测试 |

## 4. 根因

**直接根因**：插件配置读取路径未随 OpenCode 2 配置格式演进更新，只实现旧格式 `provider.<id>.options.modelsDiscovery`，而用户配置已迁移到新格式 `providers.<id>.settings.modelsDiscovery`。取不到 `discovery` 即 `continue`，扫描循环短路。

**根因验证（四维）**：

| 维度 | 检验 | 结果 |
|------|------|------|
| 时序 | 是否「先有格式迁移，后有停止刷新」？ | ✅ `opencode.json` 改于 11:46:53，最后一次刷新 10:38:23，刷新停止在其后 |
| 排他 | 是否网络/凭据/reload 导致？ | ✅ 排除：reload 历史 2094 次无异常；10:38 前抓取一直正常；日志无 401/403 |
| 充分 | 只改配置格式是否足以造成「有模型但不刷新」？ | ✅ 足以：扫描被跳过 → 无新缓存；transform 仍注入旧缓存 → 界面有模型 |
| 必要 | 恢复扫描是否必然消除现象？ | ✅ 必然：扫描恢复后写新缓存 + reload，模型列表更新 |

**放大器**（非根因，但放大影响）：transform 冷启动注入逻辑独立于扫描路径，使「旧缓存一直在展示」掩盖了「扫描早已停止」的事实。

## 5. 方案对比表

| 方案 | 描述 | 优点 | 缺点 | 风险 | 验证成本 | 推荐理由 | 不选理由 |
|-----|------|-----|-----|------|---------|---------|---------|
| A | 只改插件：新增统一解析函数，同时读新旧格式，新格式优先 | 一处修复覆盖全部场景；用户无需改配置；向后兼容 | 需改 4 个读取点 + 补测试 | 解析优先级写错会误读 | 低（单测+重启验证） | ✅ 治本，且用户配置不用动 | — |
| B | 只改用户配置：把 cpa 的 `modelsDiscovery` 挪回 `provider.cpa.options` 段 | 改动最小（1 个文件） | 治标；旧格式已 deprecated；下次格式再变又断；其他用户同样踩坑 | 配置未来失效 | 极低 | — | 不解决插件缺陷，用户已按新格式写配置 |
| C | 同时改插件 + 回写用户配置 | 双保险 | 回写用户 `opencode.json` 违反插件「零回写污染」设计原则 | 污染用户配置 | 中 | — | 违背项目核心设计约束（README 第 20 条） |

**选定方案 A**：修复插件本身，读取 V2 新格式并保留 V1 旧格式回退。

## 6. 风险

| # | 风险 | 影响 | 缓解 |
|---|------|------|------|
| R1 | 新旧格式同名 provider 时优先级歧义 | 可能读到非预期配置 | 定义明确优先级：新格式优先，旧格式回退；补单测断言 |
| R2 | 旧格式回归 | 存量用户失效 | 等价类单测覆盖旧格式全部字段 |
| R3 | `settings` 里 `modelsDiscovery` 被透传 AI SDK | 请求侧污染 | 本次不改（遗留）。**证据**：`opencode.exe` 偏移 145043559 `XL` 白名单只剥 9 个字段，不含 `modelsDiscovery`；实测当前请求无失败（缓存已刷新 32 模型） |
| R4 | `disabled_providers` 命中项仍被 transform 注入缓存 | 禁用 provider 仍出现在模型列表；且 `providers.models.update` 对不存在 provider 会**惰性创建**（`opencode.exe` 偏移 145034311 `O(X)`→`PL.empty(X)`），缓存存在即可复活 | 本次不改（遗留）。**影响面**：仅在禁用 provider 曾产生 `{id}-models.json` 缓存时才触发；用户当前 `hermes` 无 `modelsDiscovery` 不产生缓存，故当前不触发 |

## 7. 置信度

- 根因：**高**（四维验证全通过 + 正面证据 F6 直接观测到 `Discovered provider` 缺失）。
- 方案 A 可行性：**高**（F7-F11 已由二进制/schema 取证证实新格式字段真实生效）。
- 遗留问题 R3/R4 的真实影响：**中**（未做端到端故障注入实验）。
