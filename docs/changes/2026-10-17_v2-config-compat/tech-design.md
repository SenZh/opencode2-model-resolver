# 技术设计 — V2 新格式 provider 配置兼容

## 第一节：方案环节可行性证明矩阵

> 方案 A 拆解为 7 个可独立证伪的环节，逐个清零假设。证据分级：**①可复核**（本机文件/命令输出，任何人可重跑）、**②二进制**（需 `opencode.exe` 字节定位复核）。

| 步骤/修改点 | 核心动作 | 潜在假设 / 依赖前提 | 证明手段 | 证据来源 | 级别 | 验证结论 | 备选预案 |
|:---|:---|:---|:---|:---|:---|:---|:---|
| **P1** 新增 `resolveProviderConfig` 读 `providers.<id>.settings.modelsDiscovery` | 从 config 取新格式 discovery | 假设 V2 schema 允许 provider 级 `settings` 下放自定义键 | **①经验证据 + ②schema 源码** | ①用户 `opencode.json:62-71` 的 `providers.cpa.settings.modelsDiscovery` 已被 opencode 正常加载（否则该 provider 不生效）；②`opencode.exe` 偏移 138346033：`ut=Lt(o({...显式字段}),[V(t,Wn(Co))])`，`Lt`=Struct+Rest，Rest 为 `Record<string,Json>` → **开放任意键** | ①+② | ✅ 证实可行 | 若 schema 收紧，改读插件自身 `plugins[].options`（偏移 138349526 证实存在） |
| **P2** 同一函数读 `settings.baseURL` / `settings.apiKey` | 新格式取连接参数 | 假设新格式用 `settings` 承载 baseURL/apiKey | ①经验 + ②源码 | ①用户配置 `providers.cpa.settings.baseURL` 实际连通（缓存有 32 模型）；②偏移 145037000 `s={name,...e.settings??{},...}` 整体展开；145849668 `X.provider.settings?.apiKey` | ①+② | ✅ 证实可行 | 若某 provider 包不吃 settings，回退 `options` |
| **P3** 扫描循环遍历 `providers` ∪ `provider` 两段 key | 两段 provider 都被扫到 | 假设插件读的原始文件里两段**独立存在**（无需运行时合并） | ①源码 | `src/index.ts:364-366` 直接 `JSON.parse(fs.readFileSync(configPath))`，读的是原始文件对象，两段各自存在 | ① | ✅ 证实可行（**修正**：原设计误用「运行时合并」作证据，实际依赖是「文件两段独立」） | 若某段格式非法，`try/catch` 兜底跳过 |
| P4 | 同 id 两段并存时插件取新格式，与运行时一致 | 优先级不产生分歧 | 假设运行时同 id 两段合并方向 = 新覆盖旧 | ②源码 | 偏移 145233900 `Hs(i,"providers",J,R,...)`；`Md`（145243542）以旧段 `J` 为基底、遍历新段 `R` 覆写 → **新覆盖旧**，冲突仅记诊断 | ② | ✅ 证实可行（**修正**：原 P4 证明对象与实现不匹配，已改为证明「优先级与运行时一致」） | 若方向相反，插件改为旧格式优先 |
| **P5** transform 用同一函数取 providerName / showProviderName | 展示名后缀正确 | 假设 transform 内读本地 config 文件即可（与回调对象无关）；且 `providers.models.update("cpa",...)` 能命中注册表 | ①现状观测 + ①源码 | `src/index.ts:272-278` transform 内自己读 config 文件；`src/index.ts:301` update 调用；现状界面已显示 32 个 cpa 模型（证明 update 命中） | ① | ✅ 证实可行（**修正**：原 P4 用「回调对象含新格式 provider」作证据，方向错，已改为现状观测） | 若 update 不命中，改为先 `providers.add` |
| **P6** 保持 `CACHE_SCHEMA_VERSION = 3` | 已有缓存不失效 | 假设修复不改缓存结构 | ①源码 | `src/index.ts:20`；改动仅涉及配置读取来源，不触碰 `CachedModelEntry` | ① | ✅ 证实可行 | 若误改结构，升版本并接受一次重扫 |
| **P7** 构建 `dist/` 并让修复抵达运行时 | 修复真正生效 | 假设需选定分发方式 | ①源码 + ①配置 | `package.json:5-10`；`opencode.json:21-23` 注册 npm 包名；备份含 `file:///D:/workspace/opencode2-model-resolver` 先例（`opencode.json.bak-before-reseek-test`） | ① | ✅ 证实可行。**分发方式选定**：本地 `file://` 加载先行验证 → 通过后 npm 发布 | 若 file:// 加载失败，回退 npm 发布路径 |

### 可行性 Checklist 核对

- [x] **原子拆解**：P1-P7 均为独立改动点。
- [x] **假设清零**：7 个环节的隐性假设已显式列出并逐项取证。P3/P4/P5 原证据方向有误，已修正为可复核证据。
- [x] **硬证据支撑**：每环节至少 ①级证据；P1/P2/P4 另有 ②级二进制证据（可复核方法见下）。
- [x] **接口与前后契约**：P1-P2 与 P5 共用同一函数，输入 `(providerId, config)` 输出统一结构；P3 的 providerId 键空间被 P1/P2/P5 共用。
- [x] **运行环境对齐**：证据取自用户本机实际运行时（`opencode.exe`、`opencode.ai/config.json`）。
- [x] **证伪兜底**：每环节均有备选预案。

### ②级证据的可复核方法（供复审使用）

```powershell
# 以只读方式定位二进制字符串偏移（PowerShell）
$exe = "C:\Users\zjxin\AppData\Local\Programs\@openchamberelectron\resources\opencode-cli\opencode.exe"
$bytes = [System.IO.File]::ReadAllBytes($exe)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
$text.IndexOf('Config.Provider.Settings')       # 期望 ≈ 138346033
$text.IndexOf('"retained native value over legacy value"')  # 期望 ≈ 145243542 附近
```

---

## 第二节：技术方案设计

### 2.1 新增模块 `src/rules/provider-config.ts`

```ts
export interface ModelsDiscoveryConfig { /* 同既有 discovery 字段集 */ }

export interface ResolvedProviderConfig {
  found: boolean;
  source: "v2" | "v1" | "none";
  discovery?: ModelsDiscoveryConfig;
  baseURL: string;   // 已去除全部尾斜杠
  apiKey: string;    // 空串表示"配置未提供"，由调用方回退
  name: string;      // 已 trim；空则回退 providerId
}

export function resolveProviderConfig(providerId: string, config: unknown): ResolvedProviderConfig;

/** 收集所有启用 discovery 的 provider 目标，两段并集去重，v2 优先 */
export function collectDiscoveryTargets(config: unknown): Array<{
  providerId: string;
  config: ResolvedProviderConfig;
}>;
```

**解析规则**：

1. `isPlainObject(config.providers?.[providerId])` → `source="v2"`，从 `settings` 取三项。
2. 否则 `isPlainObject(config.provider?.[providerId])` → `source="v1"`，从 `options` 取三项。
3. 都无 → `source="none"`，`found=false`。
4. `modelsDiscovery` 仅在为 **plain object** 时才采纳；非对象（`true`/字符串/数组）一律视为无 discovery。
5. `collectDiscoveryTargets`：按 `providers` 先、`provider` 后收集，`Set` 去重，只保留 `discovery` 为对象且 `enabled !== false` 的项。

**为何 provider 级优先级而非字段级**：运行时同 id 两段合并为「新覆盖旧」（P4 已证实），插件采用整段 provider 级优先，行为与运行时一致、可预测、可测。字段级合并会把两段混成一个运行时不存在的中间态，收益为零且引入分歧。**副作用已显式定义**：v2 段有 provider 但无 discovery 时，v1 段的 discovery **不生效**（TC-12），与运行时一致。

**为何抽出 `collectDiscoveryTargets`**：使扫描循环 C3-C6 的「遍历两段 + 过滤 enabled」逻辑成为可单测纯函数（响应设计审查问题 #2/#7），避免核心路径无守护。

### 2.2 `src/index.ts` 改动点

| # | 位置 | 改动 |
|---|------|------|
| C1 | 顶部 import | 引入 `resolveProviderConfig`、`collectDiscoveryTargets` |
| C2 | transform 内（原 `:292-298`） | 用 `resolveProviderConfig(providerId, config)` 取 `discovery` 与 `name`，替代 `config?.provider?.[providerId]` 与 `options.modelsDiscovery` |
| C3 | 扫描循环（原 `:381-386`） | 改为 `for (const {providerId, config: pc} of collectDiscoveryTargets(config))`，一次调用复用结果给 C4/C5/C6 |
| C4 | 扫描内（原 `:383`） | `discovery` 取 `pc.discovery`（非空，已由 `collectDiscoveryTargets` 过滤） |
| C5 | 扫描内（原 `:391-392`） | `apiKey = pc.apiKey \|\| resolveSystemApiKey(providerId)`（**保留回退链**）；`baseURL = pc.baseURL` |
| C6 | 扫描内（原 `:432-435`） | providerName 取 `pc.name` |

**C3 的复用**：循环体内 `resolveProviderConfig` 只调用一次，结果 `pc` 复用于 C4/C5/C6，避免重复解析。

### 2.3 兼容性边界

| 场景 | 期望行为 |
|------|---------|
| 仅新格式存在 | 正常扫描，`source="v2"` |
| 仅旧格式存在 | 正常扫描，`source="v1"`（**不回归**） |
| 两段同 id | 取新格式，`source="v2"`（与运行时合并方向一致，P4） |
| 两段同 id、v2 无 discovery、v1 有 | **整段 v2 优先 → 不生效**（TC-12，与运行时一致） |
| 两段都无该 id | `found=false`，不进入扫描目标集（**新增能力**：现状只遍历 `provider` 一段，`providers` 段的 id 现状下根本不被扫到） |
| provider 值为 `null` / 非对象 | `found=false`，不抛异常（TC-13） |
| `discovery.enabled === false` | 不进入目标集（TC-09，语义与现状一致） |
| `modelsDiscovery` 非 plain object | 视为无 discovery，跳过（TC-14）。**V1 行为变更声明**：改动前旧代码 `if (!discovery \|\| discovery.enabled === false)` 对 `modelsDiscovery: true` 会**继续扫描**（`true.enabled === false` 为 false）；改动后统一按「非对象即无配置」跳过。方向是收紧（把脏类型配置从「误当启用」改为「明确忽略」），与 2.1 规则 4 一致 |
| `settings` 缺失但 provider 存在 | `baseURL=""` → 日志「baseURL is missing, skipping」，不崩溃（TC-05 / TC-SCAN-SKIP） |
| `settings` 无 apiKey | `apiKey=""`，调用方回退 `resolveSystemApiKey`（TC-16） |
| config 为 `null` / 非法 JSON | `found=false`；非法 JSON 由既有 `try/catch` 兜底 |
| `name` 为 `""` / 非字符串 / 纯空白 | 回退 `providerId`（TC-07） |
| `baseURL` 带尾斜杠 | 去除全部（TC-06） |
| `baseURL` / `apiKey` 非字符串 | `readString` 返回 `""` → 跳过该 provider。**行为变更声明**：改动前 `(provider.options?.baseURL \|\| "").replace(...)` 遇非字符串会抛 `TypeError` 并被外层 catch 吞掉，**中止整个扫描循环**；改动后仅跳过该 provider，其他 provider 不受影响 |

### 2.4 不改动项（明确排除）

- `CachedModelEntry` / `CachedModelsPayload` / `CACHE_SCHEMA_VERSION`（=3）。
- `resolveProviderModels` 签名与实现。
- `resolveAuthoritativeLimit` / `resolveModelCost` / `resolveCapabilities` / `shouldIncludeModel`。
- 缓存文件路径与命名。
- `modelsDiscovery` 各配置项语义。

---

## 第三节：测试方案设计

| 层 | 文件 | 覆盖 |
|----|------|------|
| 单元 | `test/provider-config.test.ts`（新增） | `resolveProviderConfig` / `collectDiscoveryTargets` 等价类 / 边界 / 优先级 |
| 集成 | `test/index-scan-integration.test.ts`（新增） | 扫描循环端到端（mock fetch），验证新/旧格式驱动、跳过分支 |
| 集成 | `test/inject-transform.test.ts`（扩展） | transform 端到端读新格式 config 的 `showProviderName` |
| 回归 | 既有 9 个测试文件 | 不回归 |
| E2E | 真实重启 opencode + 读 `runtime.log` / `cpa-models.json` | M1-M5 闭环 |

用例清单见 `test-cases.md`。覆盖矩阵见 `test-plan.md`。

---

## 第四节：产出契约

见 `contract.md`。
