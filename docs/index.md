# 项目知识库索引

## 项目定位

OpenCode 2 的动态模型解析插件（`@zsen/opencode2-model-resolver`）。自动扫描 OpenAI 兼容 provider 的 `/v1/models`，结合 models.dev 权威数据库与本地规则库推断每个模型的 context/output limit，注入 OpenCode 运行时，不回写用户的 `opencode.json`。

## 技术栈

- TypeScript（ES2022 / NodeNext），strict 模式
- 测试：bun test
- 构建：`tsc -p tsconfig.json` → dist/

## 模块结构

| 模块 | 职责 |
|------|------|
| `src/index.ts` | 插件入口。同步 transform 冷启动（读缓存注入）+ 异步扫描（探测 provider、解析 limit、写缓存） |
| `src/rules/limits-database.ts` | `resolveModelLimit`（规则库+兜底）、`resolveAuthoritativeLimit`（models.dev 优先合并） |
| `src/rules/filter.ts` | 模型过滤（排除 embedding 等）与展示名格式化 |
| `src/fetcher/models-dev.ts` | 拉取 models.dev 数据库 + `lookupModelsDev` 三级匹配 |
| `src/fetcher/models-fetcher.ts` | 探测 provider 的 `/v1/models` |
| `src/store/cache-store.ts` | `{providerId}.json` 持久化缓存（V1/V2 路径用） |
| `src/catalog-injector.ts` | OpenCode 2 V2 注入（`ctx.model.transform` 等），**当前无生产调用点** |
| `src/config-injector-v1.ts` | OpenCode 1 兼容注入，**当前无生产调用点** |

## 关键数据流

```
setup()
 ├─ [同步] ctx.provider.transform 读 {providerId}-models.json 注入（冷启动，不发网络）
 │        写入：name / limit / reasoning / capabilities
 └─ [异步] 扫描 config 中启用 modelsDiscovery 的 provider
        fetchModelsDevData()  ← models.dev 权威库，循环外 await 一次
        fetchRemoteModels()   ← provider /v1/models
        resolveProviderModels()  ← 过滤 + resolveAuthoritativeLimit + resolveCapabilities + buildCachedEntry
        writeFile({providerId}-models.json, {schemaVersion:2,updatedAt,models})
```

## OpenCode V2 模型字段（实测 schema，`additionalProperties:false`）

| 字段 | 是否存在 | 说明 |
|------|---------|------|
| `capabilities` | ✅ 必填 | `{tools:boolean, input:string[], output:string[]}` —— **能力显示的唯一正确位置** |
| `limit` | ✅ 必填 | `{context, input?, output}` |
| `attachment` | ❌ **不存在** | 写会被丢弃/报错 |
| `reasoning`（顶层布尔） | ❌ **不存在** | V2 用 `compatibility.reasoningField` 做协议映射 |
| `settings` | ✅ | `additionalProperties:{}`，允许自定义键 |

**取证方式**：`opencode api get "/api/model?directory=<项目>"`（用 OpenChamber 内置 CLI）。

## 模型过滤规则

非对话模型过滤采用**模态优先 + 关键词兜底**：

1. models.dev 有 `modalities.output` 且非空 → `output` 不含 `text` 即过滤（纯生图/生视频/纯音频）
2. 无模态数据 → 用 `NON_CHAT_ID_PATTERNS` 关键词兜底

**判据比 id 关键词准确**：`gemini-3.1-flash-image` 名字含 image，但 `output:[text,image]` 是多模态对话模型，保留；`gpt-image-2` 的 `output:[image]` 才是纯生图。

## 缓存格式（两套，注意区分）

| 文件 | 写入者 | 格式 |
|------|-------|------|
| `{providerId}-models.json` | `index.ts` 扫描路径 | `{schemaVersion:2, updatedAt, models:[]}` |
| `{providerId}.json` | `modelCacheStore`（V1/V2 死代码） | `{updatedAt, models:{}}` |

`schemaVersion` 变更时旧缓存自动失效重建。

## 优先级语义（重要）

**limit 合并优先级**：models.dev 权威值 > 本地规则库 > FALLBACK(131072/8192)。

数值字段使用 `value > 0` 判定，**禁止 `||`**——models.dev 中生图模型是 `{context:0,output:0}`，用 `||` 会静默吞掉 0 并回落规则值，语义混乱。

**用户显式 rules** 优先级最高，透传给 `resolveModelLimit`。

## 文档索引

- `docs/learnings.md` — 踩坑记录
- `docs/changes/2026-09-24_limit-resolver-fix/` — models.dev limit 接入修复的完整产物（需求/分析/设计/契约/三轮审查/测试/总结）
