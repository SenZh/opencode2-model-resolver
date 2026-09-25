# 接口与数据契约 (Contract) — v2 修正版

## 1. 契约定义

### 1.1 OpenCode V2 Model.Compatibility 契约
在 `opencode.exe` 内核中定义为：
```ts
interface ModelCompatibility {
  reasoningField?: string;
  requireReasoning?: boolean;
  maxTokensField?: string;
  requireFinishReason?: boolean;
  requireAssistantAfterTool?: boolean;
  supportsPromptCacheKey?: boolean;
}
```

### 1.2 注入规则与优先级契约
| 条件 | 注入行为 | 优先级保障 |
| :--- | :--- | :--- |
| `m.reasoning === true` | `modelDef.compatibility = { reasoningField: "reasoning_content", ...modelDef.compatibility }` | **既有配置优先**：若 `modelDef.compatibility` 已有 `reasoningField` 则保留原值，不覆写 |
| `m.reasoning !== true` | 保持 `modelDef.compatibility` 原状（不添加 `reasoningField`） | 保护非推理模型的纯净性 |
