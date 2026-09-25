# 测试计划 (Test Plan)

## 1. 测试策略
采用分层测试金字塔：
1. **单元测试 (Unit Tests)**：
   - `fetchModelsDevApiData` 缓存、超时与错误处理。
   - `resolveModelCost` 多级匹配策略（官方优先、全库尾段、前缀回退、无效值过滤）。
   - `buildCachedEntry` 在 `cost` 维度上的字段级防护（价格源不可用时保留旧有效 cost）。
2. **集成测试 (Integration Tests)**：
   - `parseCachedModels` 对 `schemaVersion: 3` 的解析与旧版本兼容失效。
   - `resolveProviderModels` 扫描端到端产出带有 `cost` 的缓存条目。
   - 注入端 `ctx.provider.transform` 将 `cached.cost` 正确映射为 OpenCode V2 的 `cost: [{ input, output, cache: { read, write } }]`。
3. **真实环境 E2E 验证**：
   - 重新构建插件 `bun run build`。
   - 重新触发 OpenChamber 扫描并读取真实运行时 API `/api/model`。
   - 确认详情页展示官方参考单价。

## 2. 覆盖率与质量门禁
- 保持现有 81 项测试 100% 通过（零回归）。
- 新增用例 ≥ 15 个，覆盖全部分支与边界。
- `tsc --noEmit` 0 错误。
- 严禁测试污染用户真实目录（必须注入隔离环境）。
