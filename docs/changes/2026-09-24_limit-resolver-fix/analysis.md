# 分析 — limit 解析接入 models.dev

## 一、事实清单（F）与推断清单（I）

> 证据来源：源码逐行核对 + 用户机器运行产物（`~/.cache/opencode2-model-resolver/`）+ 真实 models.dev 数据实测 + 独立 sub-agent 复核。

| # | 类型 | 内容 | 证据 |
|---|------|------|------|
| F1 | 事实 | `src/index.ts` 仅 import `resolveModelLimit`，无任何 models.dev 引用 | `index.ts:4`；全仓 grep `lookupModelsDev\|fetchModelsDevData\|models-dev` 在 index.ts 零命中 |
| F2 | 事实 | `resolveModelLimit` 内部数据源只有：customRules、服务端扩展字段、模型名内嵌数字、`KNOWN_MODEL_RULES`、`FALLBACK_MODEL_LIMIT` | `limits-database.ts:216-312` |
| F3 | 事实 | `index.ts` 扫描路径是**唯一**写 `{providerId}-models.json` 的代码，第 190 行仅调 `resolveModelLimit` | `index.ts:190-194, 207-211` |
| F4 | 事实 | 用户缓存 `cpa-models.json` 中 22 条模型**全部**可被规则库/兜底解释 | 见下表逐条比对 |
| F5 | 事实 | `gpt-5.6-luna` 缓存值 `{131072, 16384}`，`/gpt-5/i` 规则值恰为 `{131072, 16384}` | `limits-database.ts:140-142` |
| F6 | 事实 | `grok-4.7` 缓存值 `{131072, 8192}`，`/grok/i` 规则值恰为 `{131072, 8192}` | `limits-database.ts:171-174` |
| F7 | 事实 | `hy4-preview` 缓存值 `{131072, 8192}`，规则库无 hy 规则，等于 `FALLBACK_MODEL_LIMIT` | `limits-database.ts:6-9` |
| F8 | 事实 | `deepseek-v4.1-flash` 缓存值 `{1048576, 65536}`，等于 `/deepseek-v4(?:\.\d+)?-flash/i` 规则 | `limits-database.ts:22-25` |
| F9 | 事实 | models.dev 真实数据中三者均有精确条目：`openai/gpt-5.6-luna`=1050000/128000、`xai/grok-4.7`=500000/500000、`tencent/hy4-preview`=1024000/64000 | 实测 fetch models.json 427 条 |
| F10 | 事实 | 实测复刻 `lookupModelsDev`，裸 id 三个均走 suffix 匹配命中 | 实测脚本输出 |
| F11 | 事实 | models.dev 请求 669ms 返回 427 条，网络正常 | 实测 `node -e fetch` |
| F12 | 事实 | `catalog-injector.ts:51` 对 Map 用 `Object.keys().length`，恒为 0，是坏日志 | `Object.keys(Map)` 语义 |
| F13 | 事实 | `catalog-injector.ts` 与 `config-injector-v1.ts` **无生产调用点**，仅被测试引用 | 全仓 grep 仅命中 test/ 与自身定义 |
| F14 | 事实 | 缓存存在两套格式：`{pid}-models.json`（裸数组，index.ts 写）vs `{pid}.json`（`{updatedAt,models}`，cache-store 写） | `index.ts:207` vs `cache-store.ts:29` |
| F15 | 事实 | `index.ts:91-93` 冷启动 transform 把缓存 `m.limit` 原样写入，无二次修正 | `index.ts:84-98` |
| I1 | 推断 | 131072 的根因是扫描路径缺 models.dev，而非查询失败 | 由 F4/F8 反证：若查询失败，deepseek 应退到 `/deepseek/i` 的 131072，但它拿到了 1048576 |

**F/I 比**：15 事实 / 1 推断。推断已由 F4+F8 反证锁定，置信度高。

## 二、缓存逐条比对（F4 展开）

| 模型 | 缓存值 (ctx/out) | 命中规则 | 规则值 | 一致 |
|------|-----------------|---------|--------|------|
| gpt-5.6-luna | 131072/16384 | `/gpt-5/i` | 131072/16384 | ✅ |
| gpt-5.6-terra | 131072/16384 | `/gpt-5/i` | 131072/16384 | ✅ |
| grok-4.7 | 131072/8192 | `/grok/i` | 131072/8192 | ✅ |
| grok-4.6 | 131072/8192 | `/grok/i` | 131072/8192 | ✅ |
| grok-4.7-build-fast | 131072/8192 | `/grok/i` | 131072/8192 | ✅ |
| hy4-preview | 131072/8192 | 无 → FALLBACK | 131072/8192 | ✅ |
| hy3 | 131072/8192 | 无 → FALLBACK | 131072/8192 | ✅ |
| deepseek-v4.1-flash | 1048576/65536 | `/deepseek-v4(?:\.\d+)?-flash/i` | 1048576/65536 | ✅ |
| gemini-3.7-flash | 1048576/65536 | `/gemini-(?:3\.[78]\|2\.[05])-flash/i` | 1048576/65536 | ✅ |
| gemini-3.8-flash | 1048576/65536 | 同上 | 1048576/65536 | ✅ |
| gemini-3.1-flash-image | 1048576/8192 | `/gemini/i` | 1048576/8192 | ✅ |
| glm-5.3 | 200000/16384 | `/glm-5/i` | 200000/16384 | ✅ |
| glm-5.3-flash | 200000/16384 | `/glm-5/i` | 200000/16384 | ✅ |
| claude-opus-4-6 | 200000/8192 | `/claude/i` | 200000/8192 | ✅ |
| claude-sonnet-4-6 | 200000/8192 | `/claude/i` | 200000/8192 | ✅ |
| gpt-6-luna | 131072/8192 | `/gpt-5/i`? 否 → 无匹配 → FALLBACK | 131072/8192 | ✅ |
| gpt-image-* (5条) | 131072/8192 | 无 → FALLBACK | 131072/8192 | ✅ |

**22 条无一例外**，全部来自规则库或兜底 → 扫描路径确实完全不含 models.dev。

## 三、根因

**根因（已确证）**：`src/index.ts` 的 `modelsDiscovery` 扫描路径（`index.ts:107-229`）是唯一写模型缓存的代码，但其 limit 解析（`index.ts:190`）只调用 `resolveModelLimit`——该函数只含本地规则库与兜底，**不含 models.dev 查询**。因此写入缓存的全部是规则值。该缓存又被 `index.ts:84-98` 冷启动 transform 原样注入运行时，错误值扩散并被持久化固化。

**根因排除项**：
- 非 models.dev 网络/超时问题（F11：669ms 正常）。
- 非 `lookupModelsDev` 匹配算法问题（F10：三个 id 均命中）。
- 非 `catalog-injector.ts:112` 合并逻辑问题（F13：该路径无生产调用）。

## 四、方案对比

| 方案 | 描述 | 优点 | 缺点 | 风险 | 验证成本 | 推荐理由 | 不选理由 |
|-----|------|-----|------|------|---------|---------|---------|
| A | 仅在 `index.ts:190` 就地加 models.dev 查询 | 改动最小 | 逻辑三处重复；`\|\|` falsy 缺陷复制；无失败防护 | 中 | 低 | — | 治标，重复逻辑继续发散 |
| B | 抽取公共 `resolveAuthoritativeLimit`，三处调用点统一，加失败防护与缓存版本化 | 单一事实源；语义统一；防护闭环 | 改动面较大 | 低 | 中 | ✅ 推荐 | — |
| C | 废弃 `index.ts` 扫描路径，统一走 `catalog-injector.ts`（V2） | 彻底消除双机制 | V2 无生产调用，未知 OpenCode 2 契约是否支持；破坏冷启动设计 | 高 | 高 | — | 依赖未验证的平台契约，风险过高 |

**选型**：方案 B。A 的重复逻辑会继续发散（当前 V1/V2/index 三处已不一致），C 依赖未经证实的平台契约。

## 五、风险

| # | 风险 | 缓解 |
|---|------|------|
| R1 | models.dev 失败返回空 Map，修复后扫描仍写规则值 → 污染复发 | `matchedModelsDev` 标志 + 不覆写已有缓存 |
| R2 | `devInfo?.limit?.context \|\| ruleLimit.context` 的 falsy 缺陷（models.dev 中 `gpt-image-2` 真实值为 0） | 用 `> 0` 显式判断，禁用 `\|\|` |
| R3 | 抽函数时改动 19 个现有测试依赖的行为 | 保持 `resolveModelLimit` 签名与语义不变，仅新增函数 |
| R4 | 缓存删除后有窗口期无模型 | 用 schemaVersion 失效替代删除，平滑过渡 |

## 六、置信度

**高**。根因由 15 条事实支撑，且被独立 sub-agent 以「源码 + 运行版 dist 双向核对」复核，置信度约 92%。唯一未闭合点：原始 `/v1/models` 响应是否含 `max_model_len` 等字段（若有则命中 `resolveModelLimit` 第 2 分支），但无论走哪个分支，根因均为「未查 models.dev」，不影响结论。
