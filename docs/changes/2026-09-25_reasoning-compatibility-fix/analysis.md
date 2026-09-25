# 根因分析与技术影响 (Analysis)

## 1. 现象与证据链

### 1.1 现象
用户反馈：
> "现在推理能力显示都不对，模型都显示没有推理能力。比如 DeepSeek 4.1 flash，它其实是有推理能力的，但是我们这里没有显示出来。"

### 1.2 数据流溯源与对比
1. **源数据层（models.dev）**：
   - `deepseek/deepseek-v4.1-flash`: `reasoning: true`
   - `google/gemini-3.8-flash`: `reasoning: true`
   - `openai/gpt-5.6-luna`: `reasoning: true`
   - `openai/gpt-image-1.5`: `reasoning: false`
2. **插件缓存层（cpa-models.json / fn-models.json）**：
   - 条目内 `reasoning: true` 正确保存。
3. **注入端（ctx.provider.transform）**：
   - 现存代码：`if (m.reasoning !== undefined) modelDef.reasoning = m.reasoning;`
4. **运行时核心层（/api/model）**：
   - 经实测，OpenCode V2 核心的 `Model.Info` 结构为严格的 Effect Schema（`additionalProperties: false`），顶层根本不存在 `reasoning` 布尔字段。
   - 官方 DeepSeek 模型之所以展示推理思考，是因为官方 Provider 带有：
     `compatibility: { reasoningField: "reasoning_content" }`
   - 而中转模型没有注入该属性，`compatibility` 为 `undefined`。
5. **OpenChamber 前端渲染层（web-dist/assets/useAppFontEffects-*.js）**：
   ```js
   lZ = (t, e) => {
     const n = e.variants.length > 0 || 
               e.compatibility?.reasoningField !== undefined || 
               e.compatibility?.requireReasoning === true;
     return {
       ...
       ...n ? { reasoning: true } : {}
     };
   };
   ```
   由于 `variants` 为空且 `compatibility` 缺失，`n` 恒为 `false`，导致 OpenChamber 判定该模型不具备推理能力！

## 2. 解决方案设计
在 `src/index.ts` 的 `ctx.provider.transform` 注入逻辑中：
- 检查 `m.reasoning === true`。
- 若具备推理能力，将 `compatibility.reasoningField` 设置为 `"reasoning_content"`（主流 OpenAI 兼容与 DeepSeek 协议的标准思维链字段名）。
- 若已有 `modelDef.compatibility` 则予以浅合并保留已有配置。
- 若 `m.reasoning !== true`，保持原样，不注入 `reasoningField`。
