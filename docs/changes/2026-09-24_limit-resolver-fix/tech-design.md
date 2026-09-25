# 技术方案设计 — limit 解析接入 models.dev

## 一、现状数据流

```
┌─ index.ts setup() ──────────────────────────────────────────┐
│                                                              │
│  [同步] ctx.provider.transform(cb)      ← 冷启动，读缓存注入  │
│         readdirSync(*-models.json) → modelDef.limit = m.limit │
│                                                              │
│  [异步 IIFE] 扫描配置的 provider                              │
│         fetch /v1/models → 22 条 raw                          │
│         resolveModelLimit(raw)  ← ❌ 只查规则库，无 models.dev │
│         writeFile({pid}-models.json)                          │
└──────────────────────────────────────────────────────────────┘
```

问题：`resolveModelLimit` 无 models.dev 层。

```
┌─ catalog-injector.ts (V2，无生产调用) ───────────────────────┐
│  fetchModelsDevData() → lookupModelsDev() → limit 合并       │
│  读 {pid}.json / 写 {pid}.json                                │
└──────────────────────────────────────────────────────────────┘

┌─ config-injector-v1.ts (V1，无生产调用) ─────────────────────┐
│  同上，逻辑重复一份                                            │
└──────────────────────────────────────────────────────────────┘
```

三处合并表达式一致但 index.ts 缺 models.dev 层：

| 调用点 | 合并逻辑 |
|--------|---------|
| `index.ts:190` | 无 devInfo 层 |
| `catalog-injector.ts:112` | `devInfo?.limit?.context \|\| ruleLimit.context` |
| `config-injector-v1.ts:68` | 同上 |

## 二、目标数据流

```
┌─ index.ts setup() ──────────────────────────────────────────┐
│  [同步] transform(cb)  ← 不变，仍只读缓存                    │
│                                                              │
│  [异步 IIFE]                                                  │
│    const cache = await fetchModelsDevData()   ← 新增，不阻塞  │
│    for each raw:                                              │
│      resolveAuthoritativeLimit(raw, {cache, rules, default})  │
│        ├─ 规则值 = resolveModelLimit(raw,...)                 │
│        ├─ devInfo = lookupModelsDev(raw.id, cache)            │
│        └─ 合并：devInfo > 0 ? devInfo : rule                  │
│    写缓存（带 schemaVersion + matchedModelsDev 防护）          │
└──────────────────────────────────────────────────────────────┘
```

## 三、新增函数设计

### 3.1 `resolveAuthoritativeLimit`

位置：`src/rules/limits-database.ts`（与 `resolveModelLimit` 同文件，复用规则库常量）

```ts
export interface AuthoritativeLimitOptions {
  modelsDevCache?: Map<string, ModelsDevModel>;
  rules?: ModelRule[];
  defaultLimit?: Partial<ModelLimit>;
}

export interface AuthoritativeLimitResult {
  limit: ModelLimit;
  reasoning?: boolean;
  /** 是否命中 models.dev（用于判断数据源权威性） */
  matchedModelsDev: boolean;
}

export function resolveAuthoritativeLimit(
  rawModel: RawOpenAIModel,
  options?: AuthoritativeLimitOptions
): AuthoritativeLimitResult;
```

**合并语义（关键）**：

| 字段 | 优先级 | 说明 |
|------|--------|------|
| context | `devInfo.context > 0` → devInfo.context；否则 rule.context | 显式 `> 0`，禁用 `\|\|`，避免 0 被吞 |
| output | `devInfo.output > 0` → devInfo.output；否则 rule.output | 同上 |
| input | `devInfo.input > 0` → devInfo.input；否则 rule.input | 同上；两者都无则该字段不输出 |
| reasoning | `devInfo.reasoning \|\| rule.reasoning` | 布尔 OR，无 falsy 陷阱 |

**注意**：暂不修改 `resolveModelLimit` 本身，保持其签名与语义 100% 不变，现有测试零影响。

### 3.2 缓存格式版本化

`src/index.ts` 写缓存的 payload 从裸数组改为带版本：

```ts
// 旧：JSON.stringify(processedModels)
// 新：
interface CachedModelsPayload {
  schemaVersion: 1;
  updatedAt: number;
  models: ProcessedModel[];
}
```

**读取兼容（同步 transform 路径 `index.ts:71-99` 与扫描路径均需改）**：

```ts
const parsed = JSON.parse(readFileSync(path));
// 新格式
if (parsed && parsed.schemaVersion === 1 && Array.isArray(parsed.models)) {
  models = parsed.models;
} else if (Array.isArray(parsed)) {
  // 旧格式裸数组 → 视为过期，丢弃，不注入
  continue; // 或 return
} else {
  continue;
}
```

**必须同步修改的点**：
- `index.ts:75` 日志 `cachedModels.length` → `models.length`（新格式下 `parsed.length` 是 undefined）。
- `index.ts:84` 的 `for (const m of cachedModels)` → `for (const m of models)`。
- 扫描路径 `index.ts:159` 读取旧缓存用于失败防护时，同样需要解出新格式的 `models`。

### 3.3 失败防护（字段级，非文件级）

**问题**：models.dev 不可用时（`fetchModelsDevData` 返回空 Map），扫描路径算出的全是规则值。若无条件覆写缓存，会把「上次成功写入的权威值」改成规则值，造成污染。

**但不能用文件级跳过**（那会导致 models.dev 长期不可用时，provider 新增模型永远进不了缓存）。

**方案**：按模型逐条判断，仅在「本次有权威值」或「旧缓存无该模型」时写入新值；若「本次无权威值且旧缓存已有该模型」则**保留旧值**：

```ts
const prevEntry = prevModelsById[modelID];  // 上次缓存的该模型
const hasAuthoritative = authoritative.matchedModelsDev;

if (!hasAuthoritative && prevEntry && (prevEntry.limit?.context ?? 0) > 0) {
  // 本次拿不到权威值，旧值更可信 → 保留旧值
  processedModels.push(prevEntry);
} else {
  processedModels.push(newEntry);
}
```

**副作用声明**：models.dev 永久不可用时，已有模型的值保持不变（不更新为规则值），新模型仍会被写入规则值。这是可接受的权衡——保留旧权威值优于用规则值覆盖。

## 四、改动清单

| 文件 | 改动 | 行 |
|------|------|-----|
| `src/rules/limits-database.ts` | 新增 `resolveAuthoritativeLimit` + 两个 interface | 文件末尾 |
| `src/fetcher/models-dev.ts` | 导出 `ModelsDevModel` 类型（已导出，确认即可） | — |
| `src/index.ts` | import 新函数；扫描路径 await fetchModelsDevData；改用 resolveAuthoritativeLimit；缓存版本化 + 失败防护；读取兼容 | 4, 107-229 |
| `src/catalog-injector.ts` | 改用 resolveAuthoritativeLimit（消重）；修 `:51` 坏日志 | 2, 50-51, 106-114 |
| `src/config-injector-v1.ts` | 改用 resolveAuthoritativeLimit（消重） | 2, 61-70, 113-122 |
| `test/authoritative-limit.test.ts` | 新增单测 | 新文件 |
| `test/index-cache.test.ts` | 新增缓存版本化/防护单测 | 新文件 |

## 五、测试方案设计

见 `test-plan.md`。核心思路：

1. 公共函数单测：喂 mock models.dev 数据，断言三模型正确值。
2. 边界：`context:0` 不被 `||` 吞；models.dev 空 Map 时降级规则库。
3. 防护：空 Map + 旧缓存存在 → 不覆写。
4. 兼容：旧格式裸数组缓存被丢弃。
5. 回归：现有 19 测试全绿。

## 六、0 值语义（唯一权威定义）

**决策：models.dev 返回的 `0` 视为「无效/未提供」，回落规则库值。**

理由：models.dev 中 `gpt-image-*` 的 limit 为 `{context:0, output:0}`，表示该模型不适用文本上下文（生图模型），而非"上下文长度为 0"。将其当作有效值会注入非法 limit；回落规则值则维持现状。

**唯一实现**：所有字段用 `value > 0 ? devInfoValue : ruleValue`，**禁止 `||`**（`||` 会把 0 和 undefined 混为一谈，虽结果同为回落，但语义不清晰且易误改）。

**`gpt-image-*` 的实际归宿**：`gpt-image-2` 不含 `gpt-4` 子串，不命中任何 `KNOWN_MODEL_RULES`，走**第 5 分支 `FALLBACK_MODEL_LIMIT`** = `{131072, 8192}`。故行为与修复前一致。

## 七、不做的事（遗留）

- `gpt-image-*` 等生图模型是否应从过滤层排除 → 需产品决策，遗留。
- `lookupModelsDev:99` 硬编码白名单 → 脆弱性，非根因，遗留。
- `lookupModelsDev` 最长前缀优先 → 歧义鲁棒性，非根因，遗留。
