# 技术方案设计 (Technical Design) — v2 修正版

## 1. 架构与改动点

```
┌──────────────────────────────────────────────┐
│  CachedModelEntry (m.reasoning: boolean)     │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  ctx.provider.transform (src/index.ts)       │
│                                              │
│  if (m.reasoning === true) {                 │
│    modelDef.compatibility = {                │
│      reasoningField: "reasoning_content",    │
│      ...modelDef.compatibility,              │ // 既有配置优先保留，绝不篡改
│    };                                        │
│  }                                           │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  OpenCode V2 Model.Info.compatibility        │
│  { reasoningField: "reasoning_content" }     │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  OpenChamber 前端 lZ 转换器                   │
│  e.compatibility?.reasoningField !== undef   │
│  => reasoning: true                          │
│  => 详情页展示「推理思考」, 列表「R」点亮       │
└──────────────────────────────────────────────┘
```

## 2. 字段兼容性与保护机制
1. **默认 `reasoningField` 选择 `"reasoning_content"`**：
   - DeepSeek 官方 API、vLLM、Ollama、SGLang 以及绝大多数 OpenAI-Compatible 中转站均使用 `reasoning_content` 作为推理思考内容的输出字段。
   - OpenCode 核心原生支持 `"reasoning_content"`，并自动将其提取为思维链追踪（Reasoning Trace）。
2. **已有配置与自定义覆盖保护（关键修正）**：
   - 将 `...modelDef.compatibility` 置于后侧（或使用 `??`）：
     `modelDef.compatibility = { reasoningField: "reasoning_content", ...modelDef.compatibility }`
   - 若用户或上游配置已经显式定义了 `reasoningField: "thought"` 等自定义值，解构后将保持用户配置不变，绝不发生覆盖篡改。
   - 保留其他已有 compatibility 属性（如 `requireReasoning` 等）。
3. **遗留字段保留说明**：
   - 保留 `if (m.reasoning !== undefined) modelDef.reasoning = m.reasoning;` 仅用于向下兼容可能消费此顶层属性的遗留工具，但明确其在 OpenCode V2 核心中不发挥协议作用。
