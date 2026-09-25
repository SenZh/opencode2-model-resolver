# 技术方案设计 — 生图模型过滤 + 能力字段补全

## 一、数据结构变更

### 1.1 CachedModelEntry 扩展

```ts
interface ModelCapabilities {
  tools: boolean;
  input: string[];
  output: string[];
}

interface CachedModelEntry {
  id: string;
  name: string;
  limit: { context: number; output: number; input?: number };
  reasoning: boolean;          // 缓存字段（V2 无顶层 reason 字段，不注入但保留）
  capabilities: ModelCapabilities;  // 新增，必填，注入 V2
}
```

### 1.2 缓存 schemaVersion 递增

`CACHE_SCHEMA_VERSION: 1 → 2`。理由：数据结构变更，旧缓存（无 capabilities）必须失效重建，否则注入端写不出 capabilities。

## 二、过滤逻辑改造

### 2.1 `shouldIncludeModel` 增加非对话模型过滤

位置：`src/rules/filter.ts`

新增第 4 参数 `modelsDevInfo?: ModelsDevModel`（**可选**，由调用方传入已 lookup 的结果）：

```ts
export function shouldIncludeModel(
  model: RawOpenAIModel,
  include?: string[],
  exclude?: string[],
  modelsDevInfo?: ModelsDevModel
): boolean
```

**依赖方向说明**：`shouldIncludeModel` 本身**不做 lookup**，只消费调用方传入的 `modelsDevInfo`。这样 `filter.ts` 不引入对 `fetcher/models-dev.ts` 的依赖（保持 `filter` 为纯规则层，无网络/数据层依赖）。调用方（`index.ts`）负责 lookup 并传入。

**统一谓词**（过滤与 capabilities 共用，消除空数组语义分歧）：

```ts
/** 是否有可用的模态数据：非空数组才算有 */
function hasModalities(info?: ModelsDevModel): boolean {
  return Array.isArray(info?.modalities?.output) && info.modalities.output.length > 0;
}
```

**判定流程**（在现有逻辑之后追加）：

```
1. 若 hasModalities(modelsDevInfo)：
     output 不含 "text" → 返回 false（非对话模型）
2. 否则（无 devInfo / 无 modalities / output 为空数组）：
     用关键词兜底：id 匹配纯生成模式 → 返回 false
```

**语义统一**：`output: []`（空数组）与 `undefined` **等价**，都走第 2 步关键词兜底。这一谓词同时被 `resolveCapabilities` 使用。

**关键词兜底规则**（仅在 models.dev 无模态数据时启用）：

```ts
const NON_CHAT_ID_PATTERNS = [
  /-image(?:-|$)/i,       // gpt-image-2.5, gemini-*-image
  /^gpt-image/i,
  /imagine/i,             // grok-imagine-image-2.0
  /-tts(?:-|$)/i,
  /-video(?:-|$)/i,
  /^dall-e/i,
];
```

**注意**：`gemini-3.1-flash-image` 这类在 models.dev 有 `output:[text,image]`,第 1 步就判定为对话模型保留，不会走到关键词兜底。关键词只在无数据时生效，避免误伤。

### 2.2 调用点调整

`index.ts` 的 `resolveProviderModels` 中，先查 models.dev 再过滤：

```ts
// 原：if (!shouldIncludeModel(raw, include, exclude)) continue;
const devInfo = lookupModelsDev(modelId, modelsDevCache);
if (!shouldIncludeModel(raw, include, exclude, devInfo)) continue;
```

## 三、能力字段补全

### 3.1 新增映射函数

位置：`src/rules/filter.ts`（与 filter 同域）

```ts
const DEFAULT_CAPABILITIES: ModelCapabilities = {
  tools: false,
  input: ["text"],
  output: ["text"],
};

export function resolveCapabilities(
  modelsDevInfo?: ModelsDevModel
): ModelCapabilities {
  if (!modelsDevInfo) return { ...DEFAULT_CAPABILITIES };

  const input = modelsDevInfo.modalities?.input?.length
    ? [...modelsDevInfo.modalities.input]
    : ["text"];
  const output = modelsDevInfo.modalities?.output?.length
    ? [...modelsDevInfo.modalities.output]
    : ["text"];

  return {
    tools: modelsDevInfo.tool_call === true,
    input,
    output,
  };
}
```

### 3.2 `resolveProviderModels` 产出扩展

```ts
// 已有 devInfo（来自 2.2 的过滤改造）
const capabilities = resolveCapabilities(devInfo);

result.push(
  buildCachedEntry({
    id: modelId,
    name,
    limit: authoritative.limit,
    reasoning: authoritative.reasoning === true,   // 缓存字段，供 V1/调试
    capabilities,
  }, ...)
);
```

> **不写入 `attachment`**：V2 的 `Model.Info` 无此字段（实测，见 §3.5）。

### 3.3 注入端同步

`index.ts` 的 `ctx.provider.transform` 注入循环（当前只写 name/limit/reasoning）：

```ts
modelDef.name = name;
if (m.limit) modelDef.limit = m.limit;
// V2 无顶层 reasoning 字段，写入被丢弃，但保留以兼容 V1/旧路径
if (m.reasoning !== undefined) modelDef.reasoning = m.reasoning;
// 能力：V2 唯一有效位置
if (m.capabilities) modelDef.capabilities = m.capabilities;
// 不写 attachment（V2 无此字段）
```

### 3.4 失败防护与 schemaVersion 递增的关系

`buildCachedEntry` 以 **limit** 为「旧条目是否可用」的判据，命中时**整条**返回 `prev`。本次新增 `capabilities`/`attachment` 两个与 limit 无关的字段，需分两种情况讨论：

- **迁移期（一次性）**：schemaVersion 1→2 使旧缓存整体失效，重建时全部携带新字段。此时「旧值缺 capabilities 却被保留」不会发生。
- **稳态（周期性）**：一旦缓存已全部携带 `capabilities`，若 `models.dev` 不可用（`fetchModelsDevData` 返回空 Map），`buildCachedEntry` 会**每轮无差别整条保留 `prev`**，新字段由此被冻结在旧值。

**本期决策**：**显式接受稳态冻结副作用**。理由：
1. 冻结的旧值来自上一次成功的权威数据，优于用规则值覆盖。
2. `capabilities` 变化频率低（模型模态极少变）。
3. schemaVersion 递增时会被强制刷新。

若未来需消除，可扩展可用性判据为「`prev.limit` 与 `prev.capabilities` 均有效」。

### 3.5 OpenCode V2 模型字段的 schema 依据（已实测核实）

**取证方式**：`opencode api get "/api/model?directory=<项目目录>"` 获取运行时模型对象。

**实测结论**：

| 字段 | Model.Info 是否定义 | 实测传输结果 | 本次处理 |
|------|-------------------|-------------|---------|
| `capabilities` | ✅ 有，`{tools:boolean, input:string[], output:string[]}` | 传输成功 | **写入**（唯一正确位置） |
| `limit` | ✅ 有，`{context, input?, output}` | 传输成功 | 已有逻辑 |
| `attachment` | ❌ **无**（`additionalProperties:false`） | 不传输 | **不写**（技术方案原计划写 attachment，已取消） |
| `reasoning`（顶层布尔） | ❌ **无** | 不传输（被丢弃） | **不写**（用户要求的「reasoning 显式布尔」在 V2 无对应字段，改写在 `capabilities` 无法体现，故保留缓存字段但不注入） |

**当前实测现象（问题证据）**：`cpa` 下**所有模型**（含 `gpt-image-2`、`grok-imagine-image-2.0`）的 capabilities 都是 `{tools:true, input:["text","image"], output:["text"]}` —— 完全一致，这是 OpenCode 的默认值，说明插件的 `capabilities` **从未被写入过**。

**修正**：原计划「reasoning 显式布尔写入」在 V2 无落点。保留在缓存中（供未来 V1 路径或调试用），但不注入运行时。契约的 G4 相应调整为「缓存中 reasoning 字段统一」，而非「UI 显示」。

**注意**：`capabilities` 是 `Model.Info` 的 **required** 字段，缺失会导致模型加载异常——因此全量写入是必要的。

## 四、改动清单

| 文件 | 改动 | 位置 |
|------|------|------|
| `src/rules/filter.ts` | 新增 `ModelCapabilities` 类型、`resolveCapabilities`、`NON_CHAT_ID_PATTERNS`；`shouldIncludeModel` 增加第 4 参数（可选） | 文件内 |
| `src/index.ts` | `CACHE_SCHEMA_VERSION` → 2；`CachedModelEntry` 扩展；`resolveProviderModels` 查 devInfo + 过滤 + 补字段；transform 注入端补字段 | 9, 11-16, 88-145, 230-243 |
| `test/filter.test.ts` | 补非对话模型过滤用例 | 追加 |
| `test/capabilities.test.ts` | 新增能力映射用例 | 新文件 |
| `test/index-scan.test.ts` | 补端到端断言 capabilities/过滤 | 追加 |
| `test/cache-payload.test.ts` | 更新 schemaVersion 与字段断言 | 修改 |

### 4.1 关于另两个 `shouldIncludeModel` 调用点（有意冻结）

`shouldIncludeModel` 共 3 个调用点：

| 调用点 | 生产调用？ | 本次处理 |
|--------|-----------|---------|
| `src/index.ts:115` | ✅ 是（唯一活路径） | **改造**，传入 devInfo |
| `src/catalog-injector.ts:95` | ❌ 否（`injectV2Catalog` 无生产调用） | **不改造**，第 4 参数可选故行为不变 |
| `src/config-injector-v1.ts:107` | ❌ 否（`injectV1Config` 无生产调用） | 同上 |

**显式声明**：第 4 参数设计为**可选**，因此两处死代码不传参仍能编译运行，行为退化为「不做模态过滤」。这是**有意接受的实现分叉**——死代码不投入维护成本。若未来 V1/V2 路径被激活，需同步改造这两处。此声明同时记录到 `docs/index.md`。

## 五、测试方案

见 `test-plan.md`。核心：

1. 过滤：纯 image/audio/video 模型被剔除；多模态模型保留。
2. 兜底：无 models.dev 数据时 `gpt-image-2.5` 被关键词剔除；`gemini-3.1-flash-image` 不误伤。
3. 能力映射：真实值、默认值、部分缺失三种情况。
4. 端到端：缓存中 100% 模型含 capabilities/reasoning。
5. 回归：现有 55 例全绿。

## 六、不做的事（遗留）

- `lookupModelsDev` 最长前缀优先（`gpt-image-2.5` 靠关键词兜底而非匹配修复）。
- 已被过滤模型的「用户想用时如何暴露」——如需，后续加 provider 级配置开关。
