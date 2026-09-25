# 变更总结：模型推理能力兼容性字段修复 (Reasoning Compatibility Fix)

## 1. 变更目标与成效
本变更彻底解决了第三方中转 Provider（如 CPA、FN）注入的推理模型（如 `deepseek-v4.1-flash`、`gemini-3.8-flash`、`gpt-5.6-luna`、`grok-4.7` 等）在 OpenChamber / OpenCode V2 界面上全部显示为「无推理能力」、列表 R 图标置灰的问题。

### 修复前后对比
| 模型 | 修复前运行时 compatibility | 修复后运行时 compatibility | OpenChamber 前端判定 |
| :--- | :---: | :---: | :---: |
| `deepseek-v4.1-flash` | `undefined` | `{"reasoningField":"reasoning_content"}` | ✅ 认定具备推理能力，展示「推理思考」 |
| `gemini-3.8-flash` | `undefined` | `{"reasoningField":"reasoning_content"}` | ✅ 认定具备推理能力，展示「推理思考」 |
| `gpt-5.6-luna` | `undefined` | `{"reasoningField":"reasoning_content"}` | ✅ 认定具备推理能力，展示「推理思考」 |
| `grok-4.7` | `undefined` | `{"reasoningField":"reasoning_content"}` | ✅ 认定具备推理能力，展示「推理思考」 |
| `gpt-image-1.5` | `undefined` | `undefined` | ✅ 纯生图/非推理模型纯净无污染 |

## 2. 核心改动点
1. **根因修复**：OpenCode V2 `Model.Info` 核心顶层无 `reasoning` 布尔字段，前端依赖 `compatibility.reasoningField` 进行判定。在 `src/index.ts` 的 `ctx.provider.transform` 中为 `m.reasoning === true` 的模型注入标准 `reasoning_content`。
2. **既有配置保护**：采用 `{ reasoningField: "reasoning_content", ...modelDef.compatibility }`，保障用户显式定制的推理字段（如 `"thought"`）优先级最高。
3. **测试体系完善**：补充 5 个专项覆盖用例，全套测试集达 86 项全绿通过。
