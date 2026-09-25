# 测试计划 (Test Plan)

## 1. 测试策略
1. **单元/集成测试** (`test/inject-transform.test.ts`)：
   - 验证 `reasoning: true` 的模型注入后，`modelDef.compatibility.reasoningField` 正确设置为 `"reasoning_content"`。
   - 验证 `reasoning: false` 或缺省的模型注入后，不产生 `reasoningField`。
   - 验证既有的 `compatibility` 配置不被冲掉。
2. **端到端实机验证**：
   - 重启/reload OpenCode，调用 `/api/model` 确认返回结果。
   - 检查 OpenChamber 界面，确认 DeepSeek 4.1 flash、Gemini 3.8 等模型展示「推理思考」能力。
