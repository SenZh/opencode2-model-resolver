# 根因分析与技术影响 (Analysis)

## 1. 现状与根因分析

### 1.1 现状表现
OpenChamber 聊天界面模型详情面板中，「成本 ($/100万 TOKENS)」一栏全部展示为 `—`：
- Input: `—`
- Output: `—`
- Cache read: `—`
- Cache write: `—`

### 1.2 根因定位
1. **数据源缺失**：
   插件此前仅拉取 `https://models.dev/models.json`（388KB）。经审查该文件为精简元数据字典，顶层属性仅有 `attachment, benchmarks, description, family, id, knowledge, last_updated, license, limit, links, modalities, name, open_weights, reasoning, release_date, structured_output, temperature, tool_call, weights`，**根本不包含任何价格或成本字段**。
2. **完整价格数据位于另一接口**：
   `https://models.dev/api.json`（4.7MB）为完整 Provider 组织树结构，包含了 223 个 Provider 和 8,179 个模型，其中 7,755 个模型具有完备的 `cost: { input, output, cache_read?, cache_write? }` 结构。
3. **插件产出端与缓存链缺失**：
   - `src/index.ts` 的 `resolveProviderModels` 产出的 `CachedModelEntry` 仅有 `id, name, limit, reasoning, capabilities` 五个字段。
   - `CACHE_SCHEMA_VERSION = 2` 的缓存文件中无 `cost` 节点。
   - 注入端 `ctx.provider.transform` 未写入 `cost` 数组，导致 OpenCode 运行时 `Model.Info.cost` 恒为空数组 `[]`。
   - OpenChamber 前端 `lZ` 转换器在 `e.cost` 为空时输出 `cost: undefined`，最终详情页展示为 `—`。

## 2. 方案对比与取舍

| 方案 | 数据源处理 | 网络/性能影响 | 稳定性/准确度 | 结论 |
|------|-----------|--------------|--------------|------|
| **方案 1：完全用 api.json 替换 models.json** | 只拉 `api.json` | 一次拉取 4.7MB | 极差。8179 个条目带来巨量同名与聚合商变体，彻底破坏现有的 427 个官方模型权威上下文与模态匹配规则，引发不可预知的模型冲突。 | ❌ 坚决否决 |
| **方案 2：两接口分工合并（推荐）** | `models.json` 负责限额与能力；`api.json` 负责价格字典 | 并行拉取，约 4.7MB + 388KB，耗时约 600ms。进程生命周期内拉取一次并内存缓存。 | 最优。已有的 81 个单元与边界测试 100% 保持稳定；价格独立索引匹配，互不干扰。 | ✅ 采纳 |
| **方案 3：写死本地规则价格库** | 本地静态 Map | 零网络开销 | 维护成本极高，模型众多且价格频繁调价，容易失真。 | ❌ 放弃 |

## 3. 架构影响评估
- **向下兼容性**：
  缓存版本号升级为 `CACHE_SCHEMA_VERSION = 3`，老版本 `schemaVersion: 2` 自动失效重扫，确保模型缓存内原子性补齐 `cost`。
- **性能影响**：
  `fetchModelsDevApiData` 增加内存全局单例缓存（与 `fetchModelsDevData` 机制完全对齐），并发调用复用单次 Promise，扫描多个 Provider 时零重复网络开销。
- **防御性降级**：
  若 `api.json` 请求超时或失败，`resolveModelCost` 安全降级为 `undefined`，原有上下文、模态、工具调用等核心功能不受任何影响。
