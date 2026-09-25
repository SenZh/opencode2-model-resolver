# 产出契约 — 生图模型过滤 + 能力字段补全

## 一、完成标准（可证伪）

| 场景 | 完成标准（可证伪） | 验证方式 |
|------|-------------------|---------|
| **主路径-1** | `shouldIncludeModel({id:"gpt-image-2"}, _, _, devInfoFor("gpt-image-2"))` 返回 **false**（走模态路径，`output:["image"]` 不含 text） | 单测断言 |
| **主路径-2** | `shouldIncludeModel({id:"gemini-3.1-flash-image"}, _, _, devInfoFor("gemini-3.1-flash-image"))` 返回 **true**（`output:["text","image"]` 含 text） | 单测断言 |
| **主路径-3** | `resolveCapabilities(devInfoFor("gemini-3.8-flash"))` 返回 `{tools:true, input:含 text/image/video/audio/pdf 五项, output:["text"]}` | 单测断言 |
| **主路径-4** | `resolveCapabilities(undefined)` 返回默认 `{tools:false, input:["text"], output:["text"]}` | 单测断言 |
| **主路径-5** | `resolveProviderModels(...)` 产出的每条：`typeof m.capabilities.tools === "boolean"` 且 `Array.isArray(m.capabilities.input)` 且 `m.reasoning === true \|\| m.reasoning === false` | 运行时结构断言（非仅 tsc） |
| **主路径-6** | `resolveCapabilities(devInfoFor("gpt-5.6-luna"))` 返回 `input` 含 `text`/`image`/`pdf`，`tools === true` | 单测断言（对应 G5） |
| **边界-1** | **models.dev 不可用（空 Map）** 时，`shouldIncludeModel({id:"gpt-image-2.5"}, _, _, undefined)` 返回 **false**（走关键词兜底，实测 F15 证明该模型拿不到任何 models.dev 数据） | 单测断言 |
| **边界-1b** | models.dev **可用但该模型无条目**时，`shouldIncludeModel({id:"gpt-image-2.5"}, _, _, undefined)` 同样返回 false | 单测断言 |
| **边界-2** | 无 models.dev 数据时，`shouldIncludeModel({id:"deepseek-chat"}, _, _, undefined)` 返回 **true**（不被关键词误伤） | 单测断言 |
| **边界-3** | `resolveCapabilities({modalities:undefined})` 返回默认值 | 单测断言 |
| **边界-4** | `output:["audio"]` 的模型被过滤；`output:["audio","text"]` 保留 | 单测断言 |
| **边界-5** | 缓存 schemaVersion 为 2；`parseCachedModels` 对 schemaVersion=1 的旧缓存返回 null | 单测断言 |
| **边界-6** | `modalities.output` 为**空数组 `[]`** 时，与 undefined 等价处理（不做模态过滤、capabilities 回落默认值） | 单测断言 |
| **边界-7** | 前缀命中场景：cache 仅含 `openai/gpt-image-2.5-flare`（output=["image"]）时，`lookupModelsDev("gpt-image-2.5")` 返回 undefined（F15 事实），过滤走关键词兜底 | 单测断言 |
| **集成-1** | mock `ctx.provider.transform`，喂入含 `capabilities`/`attachment` 的缓存 payload，断言 `modelDef.capabilities` 与 `modelDef.attachment` 被写入 | 集成单测 |
| **相邻-1** | 现有 55 例全部保持通过，且总数 ≥ 55（预期新增 ≥ 12 例） | `bun test` |
| **相邻-2** | `resolveModelLimit` / `resolveAuthoritativeLimit` 行为不变 | `bun test` |
| **相邻-3** | 类型检查通过 | `bunx tsc --noEmit` |

## 二、验证命令

```powershell
cd D:\workspace\opencode2-model-resolver
bun test
bunx tsc --noEmit -p tsconfig.json
bun run build
```

**缓存重建验证**（避免「未重建却静默通过」）：先删除旧缓存再重启，或断言 `payload.schemaVersion === 2 && payload.updatedAt > <变更前时间戳>`。

运行后检查 `~/.cache/opencode2-model-resolver/cpa-models.json`：
- `gpt-image-*`（除多模态的 `gpt-image-1.5` 外）不再出现
- `gemini-3.8-flash` 的 `capabilities.input` 含 5 项
- 每条都有 `capabilities` 和 `reasoning`

## 三、相邻影响范围（不被改坏）

1. `shouldIncludeModel` 原有的 mode 判断、默认排除关键词、include/exclude 逻辑——被 `filter.test.ts` 守护。
2. `resolveModelLimit` / `resolveAuthoritativeLimit`——被 `limits-database.test.ts`、`authoritative-limit.test.ts` 守护。
3. 缓存读取兼容逻辑——被 `cache-payload.test.ts` 守护。
4. `index.ts` transform 冷启动注入的 name/limit/reasoning 写入——被新增的集成-1 守护。

## 四、显式行为变更声明

| 变更 | 变更前 | 变更后 | 影响 |
|------|--------|--------|------|
| 纯生图/生视频/纯音频模型 | 注入，limit=131072（假值） | 不注入（models.dev 可用时按模态判定；不可用时按 id 关键词兜底） | 模型列表变短。`gpt-image-1.5` 在 models.dev 有条目（`output:["text","image"]`）故**通常保留**；但 models.dev 整体不可用时会因关键词 `^gpt-image` 被兜底过滤（已实测，属降级取舍） |
| 缓存 schemaVersion | 1 | 2 | 旧缓存失效，首次重启后重建 |
| reasoning 字段 | 部分模型缺失 | 全部显式布尔 | 无负面影响 |
| capabilities 字段 | 全部缺失 | 全部写入 | UI 正确显示模型能力 |
| `catalog-injector.ts` / `config-injector-v1.ts` | 死代码 | 保持死代码，不传新参数 | 实现分叉（有意，见 tech-design §4.1） |
