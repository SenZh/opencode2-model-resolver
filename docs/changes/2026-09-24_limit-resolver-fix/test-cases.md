# 测试用例清单 — limit 解析接入 models.dev

## 一、用例清单

| 用例ID | 场景 | 类别 | 前置条件 | 测试步骤 | 预期结果 | 关联契约 |
|-------|------|------|---------|---------|---------|---------|
| TC-01 | luna 权威值 | 正常 | mock cache 含 gpt-5.6-luna=1050000 | resolveAuthoritativeLimit | context=1050000, output=128000, matched=true | 主路径-1 |
| TC-02 | grok 权威值 | 正常 | mock cache 含 grok-4.7=500000 | 同上 | context=500000, matched=true | 主路径-2 |
| TC-03 | hy4 权威值 | 正常 | mock cache 含 hy4-preview=1024000 | 同上 | context=1024000, output=64000 | 主路径-3 |
| TC-05 | matched 判定 | 正常 | 命中/未命中 | 同上 | true / false | 主路径-5 |
| TC-06 | 0 值回落 | 边界 | mock {context:0,output:0} | 同上 | context=131072（非 0），matched=false | 边界-1 |
| TC-07 | 空 Map | 异常 | cache=new Map() | 同上 | 不抛异常，context=131072，matched=false | 边界-2 |
| TC-07b | 未传 cache | 异常 | 无 options | 同上 | 同上 | 边界-2 |
| TC-08 | 防护-保留旧值 | 边界 | available=false, prev 有正 context | buildCachedEntry | 返回 prev | 边界-3 |
| TC-09 | 防护-不冻结 | 边界 | available=false, prev 无 | buildCachedEntry | 返回新值 | 边界-3 |
| TC-10 | 旧格式丢弃 | 异常 | 裸数组 JSON | parseCachedModels | null | 边界-4 |
| TC-10b | 版本不符 | 异常 | schemaVersion=99 | 同上 | null | 边界-4 |
| TC-10c | 损坏 JSON | 异常 | 非法 JSON / 空串 | 同上 | null，不抛异常 | 边界-4 |
| TC-10d | models 非数组 | 异常 | models={} | 同上 | null | 边界-4 |
| TC-11 | 新格式读取 | 正常 | schemaVersion=1 | 同上 | 解出 models 数组 | 边界-4 |
| TC-12 | 部分字段回落 | 边界 | mock {context:500000,output:0} | resolveAuthoritativeLimit | context=500000, output=8192 | 边界-5 |
| TC-13 | limit 缺失 | 边界 | mock 命中但无 limit | 同上 | 全回落，matched=false | 边界-6 |
| TC-14 | 回归 rules | 回归 | — | bun test | 原 7 例全绿 | 相邻-1 |
| TC-15 | 回归 v2-catalog | 回归 | — | bun test | 原 2 例全绿 | 相邻-2 |

## 二、审查后追加用例

| 用例ID | 场景 | 类别 | 来源 | 预期结果 |
|-------|------|------|------|---------|
| P0-回归 | models.dev 可用但模型本无条目 | 边界 | code-review #1 | 写入新规则值，不冻结旧值 |
| P1-回归 | context=0 但 output>0 | 边界 | code-review #2 | matchedModelsDev=true |
| :free 后缀 | 模型名带 :free | 边界 | 覆盖后缀剥离 | 命中 models.dev |
| 自定义 rules | 透传用户规则 | 正常 | 覆盖 rules 参数 | 采用用户规则值 |
| input 透传 | input 字段 | 正常 | 覆盖 input 合并 | input=922000 |

## 三、端到端用例（test/index-scan.test.ts）

| 用例ID | 场景 | 类别 | 关联契约 | 预期结果 |
|-------|------|------|---------|---------|
| E2E-01 | 三模型经扫描路径（resolveProviderModels） | 正常 | 主路径-4 | luna=1050000, grok=500000, hy4=1024000 |
| E2E-02 | 扫描路径过滤非对话模型 | 正常 | — | embedding 被剔除 |
| E2E-03 | 展示名格式化 + provider 后缀 | 正常 | — | "GPT 5.6 Luna (CPA)" |
| E2E-04 | 旧缓存 output=0 不固化 | 边界 | 边界-3 | 回落规则值 8192 |
| E2E-05 | models.dev 不可用 + 旧缓存有效 | 边界 | 边界-3 | 保留旧值 |
| E2E-06 | models.dev 可用但模型无条目 | 边界 | 边界-3 | 写规则值，不冻结 |
| E2E-07 | 扫描结果可序列化为缓存 payload | 正常 | 边界-4 | schemaVersion=1 且值正确 |

## 四、审查后追加（第二轮）

| 用例ID | 场景 | 类别 | 来源 | 预期结果 |
|-------|------|------|------|---------|
| P1-回归-2 | 旧缓存 output=0 不视为可用值 | 边界 | test-review 第一轮 P1 | 采用新值 |
| P1-回归-3 | 旧缓存 limit 整体缺失 | 边界 | test-review 第一轮 P1 | 采用新值 |
| 版本号类型 | schemaVersion 为字符串 | 异常 | test-review 第一轮 P2 | 返回 null |
| models=null | models 为 null | 异常 | test-review 第一轮 P2 | 返回 null |
| 顶层类型 | 顶层为 null 或数组 | 异常 | test-review 第一轮 P2 | 返回 null |

## 五、用例总数

8 个文件，55 个用例，全部通过。
