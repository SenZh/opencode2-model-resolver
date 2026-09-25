# 最终总结 — 生图模型过滤 + 能力字段补全

## 一、变更总量统计

| 指标 | 值 |
|-----|----|
| 涉及文件（源码） | 2 个 |
| 涉及文件（测试） | 5 个（2 新增 + 3 修改） |
| 新增代码 | +483 行 |
| 删除代码 | -96 行 |
| 新增测试用例 | 25 个，累计 81 个 |
| 审查发现问题 | 设计 15 / 代码 6 / 测试 9，共 30 个 |
| 审查质量不合格数 | 0 |
| 遗留问题 | 5 个 |

改动文件：

| 文件 | 改动 |
|------|------|
| src/rules/filter.ts | 新增 `ModelCapabilities`、`hasModalities`、`resolveCapabilities`、`NON_CHAT_ID_PATTERNS`；`shouldIncludeModel` 增加第 4 参数 |
| src/index.ts | CACHE_SCHEMA_VERSION→2；CachedModelEntry 扩展 capabilities/reasoning 必填；resolveProviderModels 查 devInfo + 过滤 + 补字段；注入端写 capabilities |
| test/capabilities.test.ts | 新增（15 例） |
| test/inject-transform.test.ts | 新增（2 例，注入端集成） |
| test/index-scan.test.ts | 追加 8 例端到端 |
| test/cache-payload.test.ts | schemaVersion=2 更新 |
| test/filter.test.ts | 回归保持 |

## 二、关键决策回溯

见 `analysis.md` 方案对比表：

- **过滤方式**：选「模态优先 + 关键词兜底」（方案 C）。纯模态（A）会漏过无 models.dev 条目的 `gpt-image-2.5`；纯关键词（B）会误伤能对话的多模态模型。
- **capabilities 来源**：选「全量覆盖」（方案 A），用户已确认。无数据时给默认值。
- **attachment 处理**：实测 V2 `Model.Info` 无此字段 → **取消注入**（原计划写入会失败）。

**关键实测发现**：V2 的 `Model.Info` schema 为 `additionalProperties:false`,且**没有顶层 `reasoning` 字段**。设计初稿凭猜测写入了 attachment 与 reasoning，经设计审查质疑后实测取证才避免踩坑。

## 三、审查质量检视

| 检视项 | 结果 | 说明 |
|-------|------|------|
| 发现问题数与复杂度匹配 | ✅ | 2 源码文件变更发现 30 个问题 |
| 每个发现是否有引用位置 | ✅ | 全部有 |
| 严重度分布是否合理 | ✅ | 设计 3P0/7P1；代码 0P0/0P1/4P2；测试 2P1/4P2 |

**审查亮点**：
1. 设计审查的 #10 质疑（`openapi.json` 证据缺失）促使实测取证，发现 attachment/reasoning 都不是 V2 字段——避免写入两个无效字段。
2. 代码审查实测确认 `gpt-image-1.5` 在 models.dev 有条目（多模态保留），纠正了契约的模糊表述。
3. 测试审查发现契约边界-1b/边界-7 两条显式可证伪标准无测试守护。

## 四、成果物验证（5 关自检）

| # | 关卡 | 结果 | 证据 |
|---|------|------|------|
| 1 | 需求对照 | ✅ | G1 过滤（22→17，5 个生图模型消失）；G2 能力正确（gemini-3.8-flash 5 项输入）；G3 全量 capabilities；G4 全量 reasoning；G5 真实取值（gpt-5.6-luna tools=true）；G6 81 例全绿 |
| 2 | 验证执行 | ✅ | 契约主路径-1~6、边界-1~7、集成-1、相邻-1~3 全部通过；运行时 API 二次确认 |
| 3 | 相邻检查 | ✅ | grep 确认 resolveCapabilities/hasModalities 引用一致；schemaVersion 定义 1 处/使用 2 处 |
| 4 | 过程合规 | ✅ | 三阶段管道顺序执行，设计审查通过后才编码 |
| 5 | 指令遵守 | ✅ | 双审、落盘、5 关自检已执行 |

## 五、真实验证结果

**缓存 `cpa-models.json`**（schemaVersion=2，17 个模型）：

| 模型 | context | tools | input |
|------|---------|-------|-------|
| gpt-5.6-luna | 1050000 | true | text,image,pdf |
| gemini-3.8-flash | 1048576 | true | text,image,video,audio,pdf |
| gemini-3.1-flash-image | 131072 | false | text,image,video,pdf |
| gpt-image-1.5 | 131072 | false | text,image |
| hy3 / glm-5.3 | — | true | text |

**被过滤的 5 个**：gpt-image-2、gpt-image-2.5、gpt-image-2.5-flare、gpt-image-2.5-sunburst、grok-imagine-image-2.0。

**运行时 API 验证**：`/api/model` 返回的 capabilities 与缓存一致 ✅

## 六、遗留问题

| # | 问题描述 | 来源 | 后续建议 |
|---|---------|------|---------|
| 1 | `DEFAULT_EXCLUDE_KEYWORDS` 含 `"audio"`，会误伤 `gpt-4o-audio-preview` 等多模态对话模型 | 代码审查 | 改为「仅当 output 不含 text 时过滤」 |
| 2 | `tools` 与过滤判据解耦（纯生成模型若 tool_call=true 会得到 tools:true） | 代码审查 | 无实际反例，观察 |
| 3 | `lookupModelsDev` 单模型路径调用 2 次 | 设计审查 | 幂等，性能可忽略 |
| 4 | 集成测试的 runtime.log 隔离依赖平台行为 | 测试审查 | 加固或声明 |
| 5 | 被过滤模型如何按需暴露 | 设计 | 如需，加 provider 级配置开关 |
