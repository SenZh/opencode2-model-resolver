# 需求规范：官方参考成本注入 (Cost Injection)

## 1. 背景与目标
在 OpenChamber / OpenCode V2 的模型详情面板中，「成本 ($/100万 TOKENS)」一栏（包含 Input、Output、Cache read、Cache write）目前全部展示为破折号 `—`。
用户希望将模型的成本数据补充展示，以便直观评估各模型推理成本。

经过前端与内核源码审计：
1. **知识库截止（knowledge）与发布时间（release_date）**：受限于 OpenChamber 前端硬编码的 `lZ` 转换器及 OpenCode V2 `Model.Info` 的 schema 限制，自定义中转 Provider（如 cpa、fn）无法通过插件注入展示。
2. **成本（cost）**：OpenCode V2 的 `Model.Info` 结构支持 `cost: [{ input, output, cache: { read, write } }]`，OpenChamber 前端 `lZ` 函数也会将 `e.cost` 解析并在详情页展示。

本需求的量化目标是：
- 从权威价格源获取官方参考标价（美金 / 百万 tokens）。
- 缓存升级支持成本字段，schemaVersion 递增为 3。
- 注入端 transform 正确写入 `cost` 数组，使 OpenChamber 详情面板展示 Input / Output / Cache read / Cache write 单价。
- 缺失价格的模型安全回落（不传 cost，保持 `—`，不导致插件或 UI 崩溃）。

## 2. 功能范围
### 2.1 覆盖范围
- 新增 `fetchModelsDevApiData` 价格抓取与内存缓存模块（从 `https://models.dev/api.json`）。
- 新增 `resolveModelCost` 价格解析匹配函数：
  - 优先级 1：官方原厂 Provider 精确匹配（如 `openai`, `google`, `anthropic`, `xai`, `deepseek`, `zhipu`, `tencent` 等）。
  - 优先级 2：知名托管/聚合商全路径匹配（如 `deepinfra/tencent/Hy3`, `azure/gpt-image-1.5`）。
  - 优先级 3：前缀模糊匹配（如 `grok-4.7-build-fast` 前缀匹配到 `grok-4.7`）。
  - 优先级 4：未命中回落 `undefined`（保持 `—`）。
- 缓存格式升级至 `schemaVersion: 3`：
  - `CachedModelEntry` 扩展可选 `cost?: { input: number; output: number; cache_read?: number; cache_write?: number }`。
- 注入端 transform：
  - 若条目含有效 `cost`，转换为 OpenCode V2 标准的 `cost: [{ input, output, cache: { read, write } }]` 写入。
- 单元测试与端到端集成测试全覆盖。

### 2.2 不覆盖范围
- 知识库截止（knowledge）和发布时间（release_date）不在此需求中（前端架构不支持）。
- 不支持用户自定义 provider 费率倍率计算（展示原厂官方参考价）。

## 3. 验收标准
1. **数据准确性**：`gemini-3.8-flash`、`gpt-5.6-luna`、`claude-opus-4-6`、`deepseek-v4.1-flash` 等常用模型正确匹配到官方基准美金单价。
2. **缓存自动迁移**：旧版 `schemaVersion: 2` 缓存判定失效并自动重刷为 `schemaVersion: 3`。
3. **失败防护**：若价格接口网络超时或失败，不阻塞正常模型扫描与加载，模型正常载入且 cost 缺省。
4. **测试指标**：现有 81 项测试继续全部通过，新增测试覆盖率 100%，tsc 0 错误，打包构建成功。
5. **UI 验收**：重新构建后，OpenChamber 模型详情面板展示对应单价。
