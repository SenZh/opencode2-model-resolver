# 最终总结 — limit 解析接入 models.dev

## 一、变更总量统计

| 指标 | 值 |
|-----|----|
| 涉及文件（源码） | 6 个 |
| 涉及文件（测试） | 5 个（3 新增 + 2 强化） |
| 新增代码 | +386 行 |
| 删除代码 | -92 行 |
| 新增测试用例 | 35 个（13+15+7），累计 55 个 |
| 审查发现问题 | 设计 10 / 代码 6 / 测试 12，共 28 个 |
| 审查质量不合格数 | 0 |
| 遗留问题 | 4 个 |

改动文件清单：

| 文件 | 改动 |
|------|------|
| src/rules/limits-database.ts | 新增 `resolveAuthoritativeLimit` + 2 interface |
| src/index.ts | 新增 `resolveProviderModels`/`buildCachedEntry`/`parseCachedModels`；扫描路径接入 models.dev；缓存版本化；读取兼容 |
| src/catalog-injector.ts | limit 合并改用新函数；修坏日志 |
| src/config-injector-v1.ts | limit 合并改用新函数 |
| src/fetcher/models-dev.ts | 新增 `__resetModelsDevCacheForTest` |
| src/store/cache-store.ts | 支持注入目录 + 惰性求值（测试隔离） |

## 二、关键决策回溯

见 `analysis.md` 第四节方案对比表：

- **方案 A（就地加 models.dev 查询）**：不选。逻辑三处重复会继续发散（现状 V1/V2/index 已不一致）。
- **方案 B（抽公共函数 + 统一三处 + 版本化 + 防护）**：✅ 选中。单一事实源，语义统一，防护闭环。
- **方案 C（废弃 index.ts 扫描路径，统一走 V2）**：不选。V2 无生产调用点，契约未验证，风险过高。

**根因结论回溯**：根因不是 models.dev 查询失败（实测 669ms 正常），而是 `index.ts` 扫描路径**从未调用** models.dev——它是唯一写模型缓存的路径，却只调 `resolveModelLimit`（纯规则库）。由「deepseek-v4.1-flash 缓存值 = 规则库精确值 1048576/65536」反证规则引擎正常，排除查询失败。

## 三、审查质量检视

| 检视项 | 结果 | 说明 |
|-------|------|------|
| 发现问题数与变更复杂度匹配 | ✅ | 6 源码文件变更发现 28 个问题 |
| 每个发现是否有引用位置 | ✅ | 全部有行号/契约条目 |
| 严重度分布是否合理 | ✅ | 设计 2高4中4低；代码 1高1中4低；测试 P0/P1/P2/P3 均有 |

**审查过程亮点**：
1. 设计审查揪出 0 值语义三处文档互相矛盾（自审未发现）。
2. 代码审查揪出失败防护过度触发（对永不在 models.dev 的模型会永久冻结规则值）——这是设计阶段未预见的新缺陷。
3. 测试审查用 3 组变异实验证明断言非空洞，并发现 `buildCachedEntry` 只校验 context 不校验 output 的隐藏 bug。

## 四、成果物验证（5 关自检）

| # | 关卡 | 结果 | 证据 |
|---|------|------|------|
| 1 | 需求对照 | ✅ | requirements G1-G6 逐条：G1 根因证实（analysis 15 事实）；G2 luna=1050000 ✅；G3 grok=500000 ✅；G4 hy4=1024000 ✅；G5 失败防护 ✅（E2E-05/06）；G6 全绿 ✅ |
| 2 | 验证执行 | ✅ | contract 主路径-1~5、边界-1~6、相邻-1~3 全部有对应用例且通过 |
| 3 | 相邻检查 | ✅ | grep 确认 `resolveModelLimit` 仅被新函数内部调用；三处调用点统一；现有 20 个回归用例全绿 |
| 4 | 过程合规 | ✅ | 产物均按 workflow 顺序产出，设计审查通过后才编码 |
| 5 | 指令遵守 | ✅ | 三阶段管道、双审、落盘、learnings 均已执行 |

## 五、遗留问题

| # | 问题描述 | 来源 | 后续跟踪建议 |
|---|---------|------|------------|
| 1 | `config-injector-v1.ts` 无生产调用点且无测试；注释称"绝不回写磁盘"但存在 `modelCacheStore.save` 写入，注释与行为矛盾 | test-review | 确认是否死代码，若是则删除或修正注释 |
| 2 | `resolveModelLimit` 分支边界未穷尽（服务端字段别名、customDefaultLimit 合并、无效正则退化） | test-review | 补边界用例 |
| 3 | `lookupModelsDev` 硬编码组织白名单 + 前缀匹配按 Map 顺序（`glm-5.3-flash-air` 实测摇摆） | 前置分析 | 改最长前缀优先 + 动态剥前缀 |
| 4 | 生图模型（`gpt-image-*`）是否应从过滤层排除 | design-review | 产品决策 |

## 六、用户须知

**当前环境需手动清理一次**：`~/.cache/opencode2-model-resolver/` 下的 `{providerId}-models.json` 是旧格式（裸数组），新版代码会判定过期并跳过。下次启动 opencode 扫描时会自动重建为新格式。无需手动删除，但重启后需等待一次后台扫描完成（models.dev 拉取 + 各 provider 探测）。

**预期效果**：扫描完成后，`cpa-models.json` 中 `gpt-5.6-luna` 应为 `{context:1050000, output:128000}`、`grok-4.7` 为 `{context:500000, output:500000}`、`hy4-preview` 为 `{context:1024000, output:64000}`。
