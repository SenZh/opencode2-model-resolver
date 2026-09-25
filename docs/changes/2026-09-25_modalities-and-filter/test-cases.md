# 测试用例清单 — 生图模型过滤 + 能力字段补全

| 用例ID | 场景 | 类别 | 前置条件 | 预期结果 | 关联契约 | 所在文件 |
|-------|------|------|---------|---------|---------|---------|
| TC-01 | 纯 image 模型过滤 | 正常 | devInfo output=["image"] | false | 主路径-1 | capabilities.test.ts |
| TC-02 | 多模态 image 保留 | 正常 | output=["text","image"] | true | 主路径-2 | capabilities.test.ts / index-scan.test.ts |
| TC-03 | gemini-3.8-flash 全能力 | 正常 | input 5 项 | input 含 5 项, tools=true | 主路径-3 | capabilities.test.ts |
| TC-04 | 无 devInfo 默认值 | 正常 | undefined | 默认 capabilities | 主路径-4 | capabilities.test.ts |
| TC-05 | 产出结构完整 | 正常 | 4 模型混合 | 每条含 capabilities/reasoning | 主路径-5 | index-scan.test.ts |
| TC-06 | gpt-5.6-luna 真实能力 | 正常 | 真实 devInfo | input=[text,image,pdf] | 主路径-6 | capabilities.test.ts / index-scan.test.ts |
| TC-07 | 关键词兜底 | 边界 | 无 devInfo | gpt-image-2.5 → false | 边界-1 | capabilities.test.ts / index-scan.test.ts |
| TC-08 | 无 data 非生成模型 | 边界 | 无 devInfo | deepseek-chat → true | 边界-2 | capabilities.test.ts |
| TC-09 | modalities 缺失 | 边界 | {tool_call:true} | 默认 input/output | 边界-3 | capabilities.test.ts |
| TC-10 | 纯 audio 过滤 / audio+text 保留 | 边界 | output=[audio] / [audio,text] | false / true | 边界-4 | capabilities.test.ts |
| TC-11 | schemaVersion=2 解析 | 边界 | schemaVersion:2 | 解出数组 | 边界-5 | cache-payload.test.ts |
| TC-11b | schemaVersion=1 失效 | 边界 | schemaVersion:1 | null | 边界-5 | cache-payload.test.ts |
| TC-12 | 空数组等价 undefined | 边界 | output=[] | 走关键词 / 默认值 | 边界-6 | capabilities.test.ts |
| TC-13 | 前缀命中拿不到父条目（lookupModelsDev） | 边界 | cache 仅含 flare | gpt-image-2.5 → undefined | 边界-7 | index-scan.test.ts |
| TC-13b | 纯生图端到端过滤 | 集成 | gpt-image-2 在列表中 | 结果不含该 id | 主路径-1 | index-scan.test.ts |
| TC-13c | models.dev 可用但无条目仍被过滤 | 边界 | REAL_CACHE + gpt-image-2.5 | 被过滤 | 边界-1b | index-scan.test.ts |
| TC-14 | transform 注入 capabilities | 集成 | mock ctx + 缓存 | modelDef.capabilities 写入 | 集成-1 | inject-transform.test.ts |
| TC-15 | 旧 schemaVersion 缓存跳过 | 集成 | schemaVersion:1 缓存文件 | 不注入 | 边界-5 | inject-transform.test.ts |
| TC-16 | prev 冻结含 capabilities | 边界 | 空 Map + prev 有值 | 保留旧 capabilities | 边界-3 | index-scan.test.ts |
| TC-17 | 默认 capabilities（无 dev 数据） | 集成 | 未知模型 | 默认值 | 主路径-4 | index-scan.test.ts |
| TC-18 | 返回数组是副本 | 边界 | — | 修改不影响源 | 质量 | capabilities.test.ts |
| TC-19 | 原有过滤逻辑不破坏 | 回归 | — | embedding/vision 仍生效 | 相邻-1 | capabilities.test.ts |
| TC-20 | tool_call 非 true → tools=false | 边界 | tool_call:false/缺失 | false | 主路径-3 | capabilities.test.ts |
| TC-21 | input 缺失回落默认 | 边界 | output 有 input 无 | input=["text"] | 边界-3 | capabilities.test.ts |

## 用例总数

10 个测试文件，78 个用例（新增 22 个），全部通过。
