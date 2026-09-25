# 需求规范：模型推理能力兼容性字段修复 (Reasoning Compatibility Fix)

## 1. 背景与目标
在 OpenChamber / OpenCode V2 中，所有通过第三方中转 Provider（如 CPA、FN）注入的具备推理思考能力的模型（如 `deepseek-v4.1-flash`、`gemini-3.8-flash`、`gpt-5.6-luna`、`grok-4.7` 等），在界面上均未显示「推理思考」能力，列表中的「R」图标均为未激活灰色。

### 根因确证
1. OpenChamber 前端 `lZ` 转换器判定推理能力的依据是：
   `variants.length > 0 || compatibility?.reasoningField !== undefined || compatibility?.requireReasoning === true`。
2. 插件此前写入的 `modelDef.reasoning = true` 为顶层布尔字段，在 OpenCode V2 `Model.Info` 中属于无效字段，已被内核忽略。
3. 必须通过注入 `modelDef.compatibility = { reasoningField: "reasoning_content" }`（针对具备 reasoning 的模型），使 OpenCode V2 核心与 OpenChamber 正确识别并展示「推理思考」能力。

### 验收目标
1. 当 models.dev / 缓存中 `reasoning === true` 时，注入端 `transform` 正确写入 `modelDef.compatibility = { ...modelDef.compatibility, reasoningField: "reasoning_content" }`。
2. 当 `reasoning !== true`（如 `gpt-image-1.5` 或纯生图/非推理模型）时，不设置 `reasoningField`。
3. 单元测试全部通过，无回归。
4. 运行时 `/api/model` 返回具备推理能力的模型均携带正确的 `compatibility.reasoningField`。
5. OpenChamber 详情面板展示「推理思考」能力图标，列表 R 列点亮。
