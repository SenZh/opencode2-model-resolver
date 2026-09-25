# 测试方案设计 — 生图模型过滤 + 能力字段补全

## 一、测试分层

| 层 | 目标 | 文件 |
|----|------|------|
| 单元 | `shouldIncludeModel` 非对话过滤、`resolveCapabilities` 映射 | `test/filter.test.ts`（追加）、`test/capabilities.test.ts`（新增） |
| 单元 | 缓存 schemaVersion=2 | `test/cache-payload.test.ts`（修改） |
| 集成 | `resolveProviderModels` 端到端（过滤 + 字段） | `test/index-scan.test.ts`（追加） |
| 集成 | `ctx.provider.transform` 注入端写入 capabilities | `test/inject-transform.test.ts`（新增） |
| 回归 | 原有 55 例全绿 | — |

## 二、用例与契约映射

| 用例ID | 场景 | 类别 | 前置条件 | 测试步骤 | 预期结果 | 关联契约 |
|-------|------|------|---------|---------|---------|---------|
| TC-01 | 纯 image 模型过滤 | 正常 | devInfo output=["image"] | shouldIncludeModel | false | 主路径-1 |
| TC-02 | 多模态 image 模型保留 | 正常 | devInfo output=["text","image"] | 同上 | true | 主路径-2 |
| TC-03 | gemini-3.8-flash 全能力 | 正常 | 真实 devInfo | resolveCapabilities | input 含 5 项, tools=true | 主路径-3 |
| TC-04 | 无 devInfo 默认值 | 正常 | undefined | 同上 | {tools:false,input:[text],output:[text]} | 主路径-4 |
| TC-05 | 产出结构完整 | 正常 | 任意 | resolveProviderModels | 每条含 capabilities/reasoning | 主路径-5 |
| TC-06 | gpt-5.6-luna 真实能力 | 正常 | 真实 devInfo | resolveCapabilities | input 含 text/image/pdf | 主路径-6 |
| TC-07 | 关键词兜底（无 devInfo） | 边界 | undefined | shouldIncludeModel(gpt-image-2.5) | false | 边界-1 |
| TC-08 | 无 data 但非生成模型 | 边界 | undefined | shouldIncludeModel(deepseek-chat) | true | 边界-2 |
| TC-09 | modalities 缺失 | 边界 | {modalities:undefined} | resolveCapabilities | 默认值 | 边界-3 |
| TC-10 | 纯 audio 过滤/audio+text 保留 | 边界 | output=[audio] / [audio,text] | shouldIncludeModel | false / true | 边界-4 |
| TC-11 | schemaVersion=2 且旧版失效 | 边界 | schemaVersion 1 vs 2 | parseCachedModels | null / 数组 | 边界-5 |
| TC-12 | 空数组等价 undefined | 边界 | output=[] | shouldIncludeModel + resolveCapabilities | 走关键词 / 默认值 | 边界-6 |
| TC-13 | 前缀命中拿不到父条目 | 边界 | cache 仅含 flare | lookupModelsDev(gpt-image-2.5) | undefined | 边界-7 |
| TC-14 | transform 注入 capabilities | 集成 | mock ctx + 缓存含 capabilities | 驱动 setup transform | modelDef.capabilities 被写入 | 集成-1 |
| TC-15 | 全量 capabilities 覆盖 | 集成 | 22 模型 | resolveProviderModels | 100% 含 capabilities | G3 |
| TC-16 | 回归 | 回归 | — | bun test | 原 55 例全绿 | 相邻-1 |

## 三、执行命令

```powershell
cd D:\workspace\opencode2-model-resolver
bun test
bunx tsc --noEmit -p tsconfig.json
bun run build
```

## 四、通过标准

- 新增用例 ≥ 12 个全绿。
- 原有 55 例全绿（总数 ≥ 55）。
- 类型检查无错误。
