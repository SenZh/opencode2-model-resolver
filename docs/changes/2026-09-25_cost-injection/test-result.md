# 测试执行结果报告 (Test Results)

## 1. 测试套件概览
- **执行命令**：`bun test`
- **执行时间**：2026-09-25
- **结果统计**：**85 pass / 0 fail / 0 skip**（覆盖 11 个测试文件，232 个 expect 断言）
- **类型检查**：`bunx tsc --noEmit -p tsconfig.json` → **0 错误**
- **打包构建**：`bun run build` → **成功**

## 2. 详细用例执行结果

### 2.1 价格匹配模块 (`test/cost.test.ts`)
- ✅ TC-COST-01: 官方原厂精确匹配 (gpt-5.6-luna)
- ✅ TC-COST-02: 知名托管商全库尾段匹配 (hy3)
- ✅ TC-COST-03: 变体前缀模糊匹配（带合法分隔符 -）(grok-4.7-build-fast)
- ✅ TC-COST-04: 前缀模糊匹配防误伤（非法无分隔符拒绝命中）(model-11 vs model-1)
- ✅ TC-COST-05: 免费模型 0 值定价等价类允许 (free-model: {input: 0, output: 0})
- ✅ TC-COST-06: 未知模型返回 undefined
- ✅ TC-COST-07: 价格源为 null (网络不可用) 安全降级
- ✅ TC-COST-08: 无效价格防御 (负数)
- ✅ TC-COST-09: 无效价格防御 (非数字)
- ✅ TC-COST-10: 官方白名单优先于聚合商代理 (gpt-4o 命中官方定价)
- ✅ TC-COST-11: 大小写混合 ID 正常命中 (GPT-5.6-Luna)
- ✅ TC-COST-12: 乱序场景下官方原厂前缀优先收录，不受第三方托管商抢占

### 2.2 缓存格式升级与多源失败防护 (`test/cache-payload.test.ts`)
- ✅ TC-CACHE-V3-01: 正确解析新格式（schemaVersion: 3）
- ✅ TC-CACHE-V3-02: schemaVersion=2 的旧缓存在注入端判定为过期触发重刷
- ✅ TC-CACHE-V3-03: parseOldCachedModelsForFallback 兼容读取 schemaVersion=2 确保跨版本迁移断网防护
- ✅ 裸数组或版本 < 2 时 parseOldCachedModelsForFallback 返回 null
- ✅ TC-CACHE-V3-04: 双源异构防护 — modelsDev 可用，api 不可用（limit 更新，cost 保护旧值）
- ✅ TC-CACHE-V3-05: 双源异构防护 — modelsDev 不可用，api 可用（limit 保护旧值，cost 采用新值）
- ✅ TC-CACHE-V3-06: 价格源可用但该模型无价格条目 → 正常写入 undefined，不永久冻结旧值

### 2.3 注入端与扫描端到端 (`test/inject-transform.test.ts` & `test/index-scan.test.ts`)
- ✅ TC-INJECT-COST-01: 从缓存 payload 注入时应正确写入 capabilities 与符合 Effect Schema 的 cost 数组
- ✅ TC-INJECT-COST-01 (防假零验证): 无 cache_write 时保持 undefined，严禁填 0
- ✅ 缺省 cost 模型验证: 不强写 cost = []，避免抹除既有配置
- ✅ 旧 schemaVersion=2 的缓存被跳过，触发重扫
- ✅ TC-SCAN-COST-01: 扫描端到端产出附带官方参考 cost

## 3. 结论
全部 85 项测试 100% 通过，零回归，契约全面满足。
