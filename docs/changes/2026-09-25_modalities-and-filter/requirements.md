# 需求分析 — 生图模型过滤 + 能力字段补全

## 用户原始需求

1. 生图/生视频模型（如 `GPT Image 2`、`Gemini 3.1 Flash Image`）参数不对——`gpt-image-*` 显示为假的 131072 上下文。
2. 模型能力显示错误——所有模型的能力只显示「推理思考」，多模态输入（文本/图片/音频/视频）完全没有显示。

## 用户决策

| 问题 | 决策 |
|------|------|
| 纯生图模型如何处理 | **A. 过滤掉**（不注入） |
| 关键词兜底 | 需要（`gpt-image-2.5` 无 models.dev 精确条目，靠关键词兜底） |
| capabilities 覆盖范围 | **全量覆盖**（每个模型都写，无数据时给默认值） |
| reasoning: false 是否显式写 | **写**（统一字段） |

## 实现目标（可量化）

| # | 目标 | 可验证标准 |
|---|------|-----------|
| G1 | 纯生图/生视频模型被过滤 | 缓存中不再出现 `gpt-image-*`、`grok-imagine-*`、纯 audio/video 模型 |
| G2 | 多模态模型保留且能力正确 | `gemini-3.8-flash` 的 capabilities.input 含 text/image/video/audio/pdf |
| G3 | 每个模型都有 capabilities 字段 | 缓存中 100% 模型含 capabilities{tools,input,output} |
| G4 | reasoning 字段统一显式 | 缓存中 100% 模型含 reasoning 布尔值 |
| G5 | 真实数据取值正确 | `gpt-5.6-luna` capabilities.input=[text,image,pdf]、tools=true |
| G6 | 现有 55 个测试保持通过 | `bun test` 全绿 |

## 范围界定

- **在范围内**：`shouldIncludeModel` 增加非对话模型过滤；`resolveProviderModels` 补 capabilities/tool_call/attachment 字段；缓存与注入端同步。
- **不在范围内**：`lookupModelsDev` 匹配算法优化；生图模型是否通过其他方式（如独立 provider）暴露。

## 数据事实（实测 models.dev 2026-09）

- 427 条模型**全部**有 `modalities` 字段，无缺失。
- `modalities.output` 分布：text=393、image+text=11、audio+text=6、audio=4、video=5、image=8。
- 判定「非对话模型」的判据：`modalities.output` 不含 `text`（共 17 条：8 image + 4 audio + 5 video）。
- `gpt-image-2.5` 在 models.dev **无精确条目**（只有 flare/sunburst 变体），需关键词兜底。

## 需求与契约对应

见 `contract.md`。
