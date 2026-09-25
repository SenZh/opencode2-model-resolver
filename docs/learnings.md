# 踩坑记录

## 2026-09-25 — 生图模型过滤 + 能力字段补全

### 现象
1. 所有模型的能力显示都一样（只有"推理思考"），多模态输入（图片/音频/视频）完全没显示。
2. 生图模型（`gpt-image-2` 等）显示假的 131072 上下文。

### 根因
`resolveProviderModels`（index.ts）产出对象只有 `id/name/limit/reasoning` 四个字段，**完全没有能力字段**。完整链路三处都缺：
1. 产出端不生成 capabilities
2. 缓存因此不存
3. 注入端 transform 不写

而 `catalog-injector.ts` 里有一套看似正确的 `modalities`/`attachment` 处理，但那是**死代码**（无生产调用），从没生效过。所以能力字段从插件诞生起就一直是 V2 的默认值。

### 关键教训

1. **V2 的字段名是 `capabilities`，不是 `modalities`**。models.dev 用 `modalities{input,output}`，OpenCode V2 用 `capabilities{tools,input,output}`，需要映射。

2. **`Model.Info` 是 `additionalProperties:false`，写不存在的字段无效**。实测发现：
   - **没有 `attachment` 字段** → 原计划写入会失败，取消
   - **没有顶层 `reasoning` 布尔字段** → 用户要求的"reasoning 显式写"在 V2 无落点
   - 只有 `capabilities` 是能力的正确位置

   **教训**：改 `ctx.*.transform` 的 `modelDef` 前，必须先用 `opencode api get /api/model` 看真实字段，不能凭 V1 文档或猜测。

3. **`reasoning` 显示"推理思考"的来源不是插件写的字段**。V2 用 `compatibility.reasoningField`（协议层字段名映射），不是布尔标记。排查 UI 显示问题时要区分数据来源。

### 过滤判据
判定"非对话模型"用 `modalities.output` 不含 `text`（纯 image/audio/video）。这个判据比 id 关键词准确——`gemini-3.1-flash-image` 虽然名字含 image，但 `output:[text,image]` 属于能对话的多模态模型，应当保留。

**关键词兜底只在 models.dev 无数据时启用**，否则会误伤。`gpt-image-2.5` 在 models.dev 无精确条目（只有 flare/sunburst 变体），且前缀匹配方向不适用（`"gpt-image-2.5"` 不以 `"gpt-image-2.5-flare-"` 开头），所以必须靠关键词兜底。

### 测试决策验证
隔离测试时，`await import` 的**时机不是隔离生效的原因**——真正起作用的是"路径在运行时解析"（`os.homedir()` 每次调用都读环境变量）。注释写错原因会误导后人。

---

## 2026-09-24 — models.dev 权威 limit 未接入扫描路径

### 现象
`cpa` provider 下 `gpt-5.6-luna`（真实 1,050,000）、`grok-4.7`（真实 500,000）、`hy4-preview`（真实 1,024,000）的 context 全被解析为 131,072。

### 根因
`src/index.ts` 的 `modelsDiscovery` 扫描路径是**唯一**写 `{providerId}-models.json` 缓存的地方，但它第 190 行只调用 `resolveModelLimit`（纯本地规则库 + 兜底），**从不查询 models.dev**。`lookupModelsDev` 只被 `catalog-injector.ts`（V2）和 `config-injector-v1.ts`（V1）引用，而这两个路径**无生产调用点**（`index.ts` 不 import），仅在测试中出现。

于是缓存里写入的全是规则值：`gpt-5.6-luna` → `/gpt-5/i` → 131072/16384，`grok-4.7` → `/grok/i` → 131072，`hy4-preview` → 无规则 → FALLBACK 131072。该污染缓存又被 `index.ts:84-98` 冷启动 transform 原样注入，错误固化。

### 排查教训

1. **「值相同」不等于「同一路径」**。三个模型都变 13 万，第一反应是「某个匹配规则不对」。实际是三条不同的规则（`/gpt-5/i`、`/grok/i`、FALLBACK）**恰好**都是 131072，因为规则库和兜底值全是这个数。必须逐条比对缓存值 × 规则库，才能区分「同一 bug」和「共同兜底」。

2. **用 output 字段做交叉验证能定位命中分支**。`gpt-5.6-luna` 缓存 output=16384，恰好等于 `/gpt-5/i` 的 output。若只是 models.dev 查询失败，output 应为 8192。这一条把「查询失败」假设直接证伪。

3. **不要假设「有 import 就有调用」**。`catalog-injector.ts` 和 `config-injector-v1.ts` 都正确 import 了 models.dev，看着像模像样，但 grep 后发现在生产路径中零调用——是死代码。排查时要 grep 调用点，不能只看模块存在。

4. **验证要跑真实代码路径，不能只复刻逻辑**。我复刻 `lookupModelsDev` 验证三个 id 都能命中，得出「匹配算法没问题」——这个结论对，但由此推出的「所以是查询失败」错了。复刻验证只能排除被复刻的那一段，不能证明整条链路。

5. **`Object.keys(Map)` 恒为空数组**。`catalog-injector.ts:51` 用 `Object.keys(modelsDevCache).length` 打印 Map 大小，永远输出 0，把排查带偏。Map 要用 `.size`。

### 修复要点
- 新增 `resolveAuthoritativeLimit`：models.dev 优先、规则库兜底，数值字段用 `value > 0` 判定（**禁用 `||`**，否则 models.dev 中的 0 值会被静默吞掉）。
- `index.ts` 扫描路径接入 `fetchModelsDevData`，并在循环外 await 一次。
- 缓存格式加 `schemaVersion`，旧格式自动失效。
- **字段级**失败防护：models.dev 整体不可用且旧缓存有可用值时保留旧值。注意防护条件必须区分「models.dev 不可用」与「该模型本无 models.dev 条目」——后者若也保留旧值，会导致规则库更新永远无法生效（永久冻结）。

### 二次踩坑（测试阶段暴露）
`buildCachedEntry` 的可用值判断最初只校验 `prev.limit.context > 0`，不校验 `output`。旧缓存 `output=0` 时会被当作可用值整条保留，把 0 固化进缓存——违反「0 视为无效」原则。补校验时需 context 和 output **都** > 0。

### 方法论教训
- **修哪条路径就要测哪条路径**。本次修复 `index.ts` 扫描路径，但第一版测试只覆盖了 `resolveAuthoritativeLimit` 和 `buildCachedEntry` 两个底层函数，没有端到端驱动扫描路径。测试审查发现后，才抽 `resolveProviderModels` 纯函数并补端到端用例。抽象层测试不能替代目标路径测试。
- **测试必须隔离**。`v2-catalog.test.ts` 和 `cache-store.test.ts` 原本直接写用户真实的 `~/.cache` 目录，留下 `local-vllm.json` 等残留。隔离要注意：模块级单例（`modelCacheStore`）在 import 时就构造，环境变量覆盖必须在模块加载前生效，因此目录解析要改为**惰性求值**。
