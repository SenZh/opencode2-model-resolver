# 测试用例清单 (Test Cases) — v2 修正版

## 1. 成本解析与匹配测试 (`test/cost.test.ts`)

| 用例 ID | 场景描述 | 输入数据 | 预期结果 |
|---------|---------|---------|---------|
| TC-COST-01 | 官方原厂精确匹配 | `id: 'gpt-5.6-luna'`, 预索引包含 `openai/gpt-5.6-luna` (0.2 / 1.2, cache_read: 0.02) | 成功命中官方表，返回 `{input: 0.2, output: 1.2, cache_read: 0.02, cache_write: undefined}` |
| TC-COST-02 | 知名托管商全库尾段匹配 | `id: 'hy3'`, 预索引包含 `deepinfra/tencent/Hy3` (0.13 / 0.53, cache_read: 0.033) | 成功命中尾段表，返回 `{input: 0.13, output: 0.53, cache_read: 0.033}` |
| TC-COST-03 | 变体前缀模糊匹配（带合法分隔符） | `id: 'grok-4.7-build-fast'`, 前缀候选包含 `grok-4.7` (2 / 6) | 截断处含 `-`，前缀命中，返回 `{input: 2, output: 6}` |
| TC-COST-04 | 前缀模糊匹配防误伤（非法无分隔符） | `id: 'model-11'`, 前缀候选仅有 `model-1` (1 / 2) | 因缺少单词边界分隔符，**拒绝命中**，返回 `undefined` |
| TC-COST-05 | 免费模型 0 值定价等价类 | `id: 'free-model'`, cost 为 `{input: 0, output: 0}` | 允许 0 值，返回 `{input: 0, output: 0}`，不被判定为无效 |
| TC-COST-06 | 价格源未命中 | `id: 'some-completely-unknown-model'` | 返回 `undefined` |
| TC-COST-07 | 价格源为 null (网络不可用) | `id: 'gpt-5.6-luna'`, `tables: null` | 安全降级，返回 `undefined` |
| TC-COST-08 | 无效价格防御 (负数) | cost 为 `{input: -1, output: 2}` | 判定无效，返回 `undefined` |
| TC-COST-09 | 无效价格防御 (非数字/NaN) | cost 为 `{input: 'free', output: null}` | 判定无效，返回 `undefined` |
| TC-COST-10 | 官方白名单优先于聚合商 | 官方表 `openai/gpt-4o` (1.5/5) 与 聚合商 `proxy/gpt-4o` (10/20) | 优先返回官方定价 (1.5/5) |
| TC-COST-11 | 大小写混合 ID 命中 | 输入 `id: 'GPT-5.6-Luna'`, 官方表注册 `gpt-5.6-luna` | 归一化后成功命中官方表 |

## 2. 缓存升级与字段级防护测试 (`test/cache-payload.test.ts`)

| 用例 ID | 场景描述 | 输入数据 | 预期结果 |
|---------|---------|---------|---------|
| TC-CACHE-V3-01 | 正确解析新版 schemaVersion: 3 | payload 为 `{schemaVersion: 3, models: [{id, name, limit, reasoning, capabilities, cost}]}` | 返回解析后的模型数组，保留 cost |
| TC-CACHE-V3-02 | 旧版 schemaVersion: 2 注入时失效 | payload 为 `{schemaVersion: 2, ...}`，调用 `parseCachedModels` | 返回 `null` 触发自动失效重刷 |
| TC-CACHE-V3-03 | 跨版本迁移兼容读取 | 调用 `parseOldCachedModelsForFallback` 读取 `schemaVersion: 2` 文件 | 成功解析出模型条目，用于后台扫描失败防护 |
| TC-CACHE-V3-04 | 双源异构失败防护 (modelsDev 成功, api 失败) | `modelsDevAvailable: true` (新 limit), `apiAvailable: false`, 旧缓存含旧有效 cost | limit 更新为新值，同时 cost 继承旧缓存有效值 |
| TC-CACHE-V3-05 | 双源异构失败防护 (modelsDev 失败, api 成功) | `modelsDevAvailable: false`, `apiAvailable: true`, 旧缓存含旧有效 limit | limit 继承旧有效值，同时 cost 采用本次匹配的新 cost |
| TC-CACHE-V3-06 | 价格源可用但未命中的正常写入 | `apiAvailable: true`, 该模型无价格条目，旧缓存含旧值 | 正常写入 `cost: undefined`（不永久冻结旧值） |

## 3. 扫描与注入端到端测试 (`test/index-scan.test.ts` & `test/inject-transform.test.ts`)

| 用例 ID | 场景描述 | 输入数据 | 预期结果 |
|---------|---------|---------|---------|
| TC-SCAN-COST-01 | 扫描路径生成含 cost 条目 | 模拟 OpenAI-compatible 响应包含 CPA 常用模型 | 输出 models 中各模型均附带正确基准 cost |
| TC-INJECT-COST-01 | 注入端生成含 Cache 的 cost 数组 | cached 包含有效 cost `{input: 0.75, output: 3.75, cache_read: 0.075}` | `modelDef.cost` 为 `[{input: 0.75, output: 3.75, cache: {read: 0.075}}]`（无 write，防止假零） |
| TC-INJECT-COST-02 | 注入端生成不含 Cache 的 cost 数组 | cached 包含有效 cost `{input: 0.5, output: 60}`（无 cache 价格） | `modelDef.cost` 为 `[{input: 0.5, output: 60, cache: {}}]`（read/write 均为 undefined） |
| TC-INJECT-COST-03 | 缺省 cost 时不进行盲目覆写 | cached 缺失 cost 字段 | 不修改 `modelDef.cost`（不强置 `[]`），保护上游配置 |
