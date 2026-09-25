# 技术方案设计 (Technical Design) — v2 修正版

## 1. 架构模块划分与数据流

```
                     ┌───────────────────────────────────┐
                     │     https://models.dev/api.json   │
                     └─────────────────┬─────────────────┘
                                       │ fetch
                                       ▼
                     ┌───────────────────────────────────┐
                     │     fetchModelsDevApiData()       │ (fetcher/models-dev-api.ts)
                     │     解析生成 PreIndexedCostTables   │ 内存单例缓存
                     └─────────────────┬─────────────────┘
                                       │
                                       ▼
┌─────────────────────────┐  ┌───────────────────────────────────┐
│     RawOpenAIModel      │  │        resolveModelCost()         │ (rules/cost.ts)
│     (id, name ...)      ├─►│  O(1) 官方 > O(1) 全局 > 前缀约束  │
└─────────────────────────┘  └─────────────────┬─────────────────┘
                                               │ cost?
                                               ▼
┌────────────────────────────────────────────────────────────────┐
│                   resolveProviderModels() (index.ts)           │
│   产出 CachedModelEntry (包含 capabilities, limit, cost)         │
│   字段级独立防护装配 (buildCachedEntry)                           │
└──────────────────────────────┬─────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────┐
│           cpa-models.json / fn-models.json (schemaVersion: 3)  │
└──────────────────────────────┬─────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────┐
│             ctx.provider.transform (index.ts)                  │
│       有条件写入：当 cost 有效时注入标准 Model.Info.cost 数组    │
│       遵循 Effect Schema，无 cache 价格保持 undefined (防假零)   │
└────────────────────────────────────────────────────────────────┘
```

## 2. 核心模块与算法设计

### 2.1 预索引价格抓取模块 `src/fetcher/models-dev-api.ts`
为了规避单次扫描 8,179 次遍历带来的主线程卡顿问题，在数据拉取后一次性构建 **Pre-indexed Map**：
```ts
export interface ModelCost {
  input: number;
  output: number;
  cache_read?: number;
  cache_write?: number;
}

export interface PreIndexedCostTables {
  officialMap: Map<string, ModelCost>;      // 官方原厂精确匹配 key: lowerId
  globalExactMap: Map<string, ModelCost>;   // 全库提供商精确匹配 key: lowerId
  tailMap: Map<string, ModelCost>;          // 尾段纯模型名匹配 key: lowerTailId
  prefixCandidates: Array<{ prefix: string; cost: ModelCost }>; // 前缀模糊匹配池（按长度降序）
}
```
**官方 Provider 白名单**：
```ts
const OFFICIAL_PROVIDERS = new Set([
  'openai', 'google', 'anthropic', 'deepseek', 'xai',
  'meta', 'mistral', 'tencent', 'alibaba', 'zhipu', 'zai', 'cohere'
]);
```
- 提供 `fetchModelsDevApiData(): Promise<PreIndexedCostTables | null>`。
- 内存 Promise 单例复用，多次调用零重复请求。
- 提供 `__resetModelsDevApiCacheForTest()` 供单元测试隔离使用。

### 2.2 价格解析匹配模块 `src/rules/cost.ts`
输入 `modelId` 和 `PreIndexedCostTables`，通过 $O(1)$ 查找匹配定价：
1. **官方表精确匹配 ($O(1)$)**：
   `tables.officialMap.get(cleanId)`
2. **全局精确表匹配 ($O(1)$)**：
   `tables.globalExactMap.get(cleanId)`
3. **尾段纯模型名匹配 ($O(1)$)**：
   `tables.tailMap.get(tailId)`（例如 `deepinfra/tencent/Hy3` 截取出的 `hy3`）
4. **带单词边界分隔符的前缀匹配 ($O(K)$)**：
   遍历 `prefixCandidates`，只有当 `cleanId.startsWith(prefix)` 且满足下列边界之一时才允许命中：
   - 截断处紧跟 `-`、`_`、`:`、`/`（例如 `grok-4.7-build-fast` 匹配 `grok-4.7` 后跟随 `-`，合法）
   - **禁止** 无分隔符前缀匹配（例如 `model-11` 匹配 `model-1`，非法阻断）
5. **有效性约束**：
   `input >= 0` 且 `output >= 0` 为有限数字，支持免费模型 0 值定价。

### 2.3 缓存格式升级与真正「字段级」独立防护 (`src/index.ts`)
```ts
export const CACHE_SCHEMA_VERSION = 3;

export interface CachedModelEntry {
  id: string;
  name: string;
  limit: { context: number; output: number; input?: number };
  reasoning: boolean;
  capabilities: ModelCapabilities;
  cost?: ModelCost;
}
```

#### 2.3.1 跨版本平滑迁移防护 (Migration Fallback Support)
在后台扫描读取旧缓存用于失败防护时，读取辅助函数 `parseOldCachedModelsForFallback`：
- 支持兼容解析 `schemaVersion >= 2` 的历史条目。
- 即使升级后首次扫描遇到断网，旧版 v2 缓存中的正确 `limit` 和 `capabilities` 依然能够被成功保护，不会退化为 131072。
- 注入端 `parseCachedModels` 仍严格校验 `=== 3`。

#### 2.3.2 双数据源独立字段级装配
`buildCachedEntry` 重构为多源独立判定，杜绝两源一成一败时的互相覆盖：
```ts
export function buildCachedEntry(
  entry: CachedModelEntry,
  matchedModelsDev: boolean,
  matchedCost: boolean,
  prev: CachedModelEntry | undefined,
  modelsDevAvailable: boolean,
  apiAvailable: boolean
): CachedModelEntry {
  const prevHasUsableLimit = prev && typeof prev.limit?.context === "number" && prev.limit.context > 0 && typeof prev.limit?.output === "number" && prev.limit.output > 0;
  const prevHasUsableCost = prev && prev.cost && typeof prev.cost.input === "number" && typeof prev.cost.output === "number";

  return {
    ...entry,
    limit: (!modelsDevAvailable && !matchedModelsDev && prevHasUsableLimit) ? prev!.limit : entry.limit,
    capabilities: (!modelsDevAvailable && !matchedModelsDev && prev?.capabilities) ? prev!.capabilities : entry.capabilities,
    cost: (!apiAvailable && !matchedCost && prevHasUsableCost) ? prev!.cost : entry.cost,
  };
}
```

### 2.4 注入端转换与虚假零值防御 (`src/index.ts`)
在 `ctx.provider.transform` 中：
```ts
if (cached.cost && typeof cached.cost.input === "number" && typeof cached.cost.output === "number") {
  const cacheObj: { read?: number; write?: number } = {};
  if (typeof cached.cost.cache_read === "number") {
    cacheObj.read = cached.cost.cache_read;
  }
  if (typeof cached.cost.cache_write === "number") {
    cacheObj.write = cached.cost.cache_write;
  }

  modelDef.cost = [{
    input: cached.cost.input,
    output: cached.cost.output,
    cache: cacheObj,
  }];
}
```
**关键防护说明**：
- 不使用 `?? 0`。若模型没有 Prompt Caching 特性，`cacheObj.read` 保持 `undefined`。
- OpenChamber 前端 `V4(undefined)` 准确渲染为 `—`，避免出现虚假的 `$0.00` 免费展示。
- 缺省成本时不执行写操作，防止破坏上游可能携带的既有配置。
