# 分析 — 生图模型过滤 + 能力字段补全

## 一、事实清单（F）与推断清单（I）

| # | 类型 | 内容 | 证据 |
|---|------|------|------|
| F1 | 事实 | 缓存 `cpa-models.json` 中 22 个模型，**无一个**含 `modalities` 字段 | `Get-Content cpa-models.json` 检查，modalities 计数=0 |
| F2 | 事实 | 缓存中 `attachment` 字段同样全部缺失 | 同上 |
| F3 | 事实 | `resolveProviderModels`（index.ts:129-141）产出对象仅 4 个字段：`id/name/limit/reasoning` | 源码逐行确认 |
| F4 | 事实 | 同步 transform 注入（index.ts:230-243）只写 `name/limit/reasoning` | 源码逐行确认 |
| F5 | 事实 | `catalog-injector.ts` 有完整的 `attachment`/`modalities` 处理，但该文件**无生产调用点**（死代码） | 全仓 grep，仅测试引用 |
| F6 | 事实 | OpenCode V2 的能力字段名为 `capabilities`，形状 `{tools:boolean, input:string[], output:string[]}` | openapi.json 的 `Model.Capabilities` schema |
| F7 | 事实 | `Model.Info` 的 `limit` 是 `{context, input?, output}`，`capabilities` 是必填字段 | openapi.json required 列表 |
| F8 | 事实 | models.dev 的 `modalities` 形状为 `{input:string[], output:string[]}`，与 V2 capabilities 的 input/output 同名同构 | 实测 models.dev 数据 |
| F9 | 事实 | models.dev 有 `tool_call` 布尔字段，对应 V2 的 `capabilities.tools` | 实测数据含 `tool_call:true` |
| F10 | 事实 | models.dev 427 条模型**全部**有 modalities，无缺失 | 实测统计 |
| F11 | 事实 | `modalities.output` 不含 `text` 的共 17 条（image=8, audio=4, video=5） | 实测分布统计 |
| F12 | 事实 | models.dev 中 `gpt-image-2.5` **无精确条目**：gpt-image 系列仅有 `openai/gpt-image-1`、`openai/gpt-image-1.5`、`openai/gpt-image-2`、`openai/gpt-image-2.5-flare`、`openai/gpt-image-2.5-sunburst` 五条 | 取证命令：`fetch("https://models.dev/models.json")` 后 `Object.keys(json).filter(k=>/gpt-image/i.test(k))`，输出恰为上述 5 条 |
| F15 | 事实 | 复刻 `lookupModelsDev('gpt-image-2.5')` 返回 **NOT FOUND**（前缀匹配条件为 `target.startsWith(keyModel + "-")`，而 `"gpt-image-2.5"` 不以 `"gpt-image-2.5-flare-"` 开头） | 实测复刻脚本输出 |
| F16 | 事实 | `gpt-image-1.5` 的 `modalities.output` 是 `["text","image"]`（多模态），**不是**纯生图模型 | 实测数据 |
| F17 | 事实 | `shouldIncludeModel` 共 3 个调用点：`index.ts:115`（活）、`catalog-injector.ts:95`、`config-injector-v1.ts:107`（后两者为死代码） | 全仓 grep |
| F13 | 事实 | `shouldIncludeModel` 当前只按关键词/mode 过滤，**不检查模态** | filter.ts:39-83 |
| F14 | 事实 | 缓存文件 `schemaVersion=1`，数据结构由 `CachedModelEntry` 定义 | index.ts:11-16 |
| I1 | 推断 | UI 显示「只有推理思考」是因为 `reasoning` 是唯一被写入的能力类字段，其余走 V2 默认值 | 由 F1/F2/F3/F4 联合支撑 |

**F/I 比**：14 事实 / 1 推断。

## 二、根因

**能力字段丢失（F1-F5）**：完整链路三处都缺字段——
1. 产出端 `resolveProviderModels` 不生成 `modalities`/`attachment`（F3）
2. 缓存因此不存（F1/F2）
3. 注入端 `transform` 不读不写（F4）

`catalog-injector.ts` 里那套正确的字段处理从未生效（F5，死代码），所以这个问题从插件诞生就存在。

**生图模型参数错误**：`gpt-image-*` 在 models.dev 是 `{context:0,output:0}`，按「0 视为无效→回落规则库」走到 FALLBACK 131072（详见上一变更）。根子是把「非对话模型」当成「缺失数据」处理了。

**字段名映射（F6/F8/F9）**：models.dev 用 `modalities`，OpenCode V2 用 `capabilities`，需映射；`tool_call` → `capabilities.tools`。

## 三、方案对比

### 3.1 非对话模型过滤方式

| 方案 | 描述 | 优点 | 缺点 | 风险 | 推荐理由 | 不选理由 |
|-----|------|-----|------|------|---------|---------|
| A | 仅按 `modalities.output` 不含 text 过滤 | 数据驱动，精确 | `gpt-image-2.5` 无条目会漏过 | 低 | — | 有漏网 |
| B | 仅按 id 关键词过滤（image/video/audio/imagine） | 无需 models.dev 数据 | 误伤多模态模型（`gemini-3.1-flash-image` 能对话） | 高 | — | 误伤严重 |
| C（选） | **模态优先 + 关键词兜底**：有 modalities 时按 output 判断；无 modalities 且 id 命中纯生成关键词时过滤 | 兼顾精确与兜底 | 需维护关键词表 | 低 | ✅ 推荐 | — |

### 3.2 capabilities 来源

| 方案 | 描述 | 优点 | 缺点 | 风险 | 推荐理由 | 不选理由 |
|-----|------|-----|------|------|---------|---------|
| A（选） | 全量写入：有 models.dev 数据用真实值，无则给默认 `{tools:false,input:["text"],output:["text"]}` | 一致，UI 不再有空白 | 默认值可能与实际不符 | 低 | ✅ 推荐（用户已确认全量） | — |
| B | 仅 models.dev 有数据时写 | 不造假 | 字段缺失，行为不一致 | 中 | — | 用户要求全量覆盖 |

## 四、风险

| # | 风险 | 缓解 |
|---|------|------|
| R1 | 关键词兜底误伤能对话的多模态模型 | 只在「models.dev 无数据」时才用关键词；且关键词限定为明确的纯生成词（`-image` 结尾等） |
| R2 | 过滤后旧缓存仍含生图模型 | 缓存 schemaVersion 递增到 2，强制重建 |
| R3 | capabilities 默认值误导用户 | 默认值仅用于规则库兜底的自建模型，且 tools=false 时不声称支持工具 |
| R4 | V2 capabilities 必填，漏写会导致模型加载失败 | 全量写入，并加测试断言 100% 覆盖 |

## 五、置信度

**高**。14 条事实全部来自实测数据与源码逐行核对，V2 schema 来自官方 openapi.json。唯一推断（I1）由 4 条事实联合支撑。
