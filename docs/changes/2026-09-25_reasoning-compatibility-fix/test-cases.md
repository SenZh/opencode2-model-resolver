# 测试用例清单 (Test Cases) — v2 修正版

| 用例 ID | 场景描述 | 输入数据 | 预期结果 |
| :--- | :--- | :--- | :--- |
| TC-COMPAT-01 | 推理模型正确注入 compatibility.reasoningField | `m: { id: "deepseek-v4.1-flash", reasoning: true }` | `modelDef.compatibility.reasoningField === "reasoning_content"` |
| TC-COMPAT-02 | 非推理模型不注入 reasoningField | `m: { id: "gpt-image-1.5", reasoning: false }` | `modelDef.compatibility?.reasoningField === undefined` |
| TC-COMPAT-03 | 保留已有 compatibility 配置 | `modelDef.compatibility: { requireReasoning: true }`, `m.reasoning: true` | `modelDef.compatibility` 包含 `requireReasoning: true` 且 `reasoningField: "reasoning_content"` |
| TC-COMPAT-04 | 用户已有自定义 reasoningField 不被篡改 | `modelDef.compatibility: { reasoningField: "thought" }`, `m.reasoning: true` | `modelDef.compatibility.reasoningField === "thought"` (既有优先级最高) |
| TC-COMPAT-05 | 非推理模型既有 compatibility 完整保留 | `modelDef.compatibility: { maxTokensField: "max_output_tokens" }`, `m.reasoning: false` | 完整保留既有配置，且不包含 `reasoningField` |
