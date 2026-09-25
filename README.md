# opencode2-model-resolver

专为 **OpenCode 2** 设计的动态模型发现、权威元数据解析、上下文限额与官方基准成本智能注入插件（100% 兼容原版 `opencode-models-discovery` 的配置项）。

[![npm version](https://img.shields.io/npm/v/@zsen/opencode2-model-resolver.svg?color=blue)](https://www.npmjs.com/package/@zsen/opencode2-model-resolver)
[![license](https://img.shields.io/github/license/SenZh/opencode2-model-resolver)](https://github.com/SenZh/opencode2-model-resolver/blob/main/LICENSE)

---

## 核心特性

1. **自动发现全量模型**：启动时自动扫描已配置的 Provider，向其 `baseURL/models` 端点拉取并注册可用模型列表，无需手动繁琐配置。
2. **权威上下文与输出限额解析**：深度接入 `models.dev` 权威数据库（三级智能匹配算法），为 DeepSeek、Gemini、Claude、GPT、GLM、Grok、Qwen 等模型精准赋予真实的上下文与输出限制（如 1M / 128K），不再回退为过小的默认值。
3. **官方基准成本注入 (Cost Injection)**：接入 `models.dev/api.json` 价格库，自动为各模型注入官方原厂基准定价（Input / Output / Cache read / Cache write），并在 OpenChamber 详情面板精准展示，预索引匹配达到 $O(1)$ 极速响应。
4. **推理思考能力与深度档位选择 (Reasoning & Variants)**：
   - 自动映射 `compatibility.reasoningField = "reasoning_content"`，激活 OpenChamber 界面上的「推理思考」标签与列表「R」图标。
   - 自动为所有推理模型合成标准推理档位（`none` 关思考、`low` 轻度、`high` 深度、`max` 极深），用户可在界面上自由切换思考强度。
5. **智能模态识别与生图过滤**：基于 `modalities.output` 准确排除纯生图/音频模型，安全保留能对话的多模态对话模型（如 `gemini-3.1-flash-image`、`gpt-image-1.5`），并向 OpenCode V2 补齐标准的 `capabilities`（tools/input/output）。
6. **免配 API Key（安全凭据）**：优先从 OpenCode 系统凭据存储库（`~/.local/share/opencode/auth.json`）或环境变量中读取 API Key，保持配置文件清爽且密钥不落地。
7. **纯内存注入（零回写污染）**：所有动态发现的模型及 Limit 参数仅在 OpenCode 运行时注入内存，**绝不会把长篇模型列表回写污染 `opencode.json`**。
8. **本地独立极速缓存与跨版本容灾**：持久化存储于 `~/.cache/opencode2-model-resolver/`（当前格式 `schemaVersion: 3`），具备多源独立字段级装配与跨版本断网降级防护，保障弱网或离线环境下秒级极速冷启动。
9. **供应商归属标识（可选）**：支持通过 `showProviderName` 在模型展示名后自动追加 `(ProviderName)`（如 `DeepSeek V3 (SiliconFlow)`），多供应商聚合时一目了然，且底层模型 ID 严格保持不变。

---

## 安装与快速配置

在全局配置文件 `~/.config/opencode/opencode.json` 的顶层 `plugins` 列表中加入本插件：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "@zsen/opencode2-model-resolver"
  ]
}
```

以兼容 OpenAI 的标准中继为例，只需在对应 Provider 的 `options` 中加入 `modelsDiscovery`，`models` **直接置空 `{}`** 即可：

```json
{
  "provider": {
    "my-provider": {
      "name": "Custom Provider",
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "https://api.example.com/v1",
        "modelsDiscovery": {
          "enabled": true,
          "smartModelName": true,
          "showProviderName": true,
          "modelInfoFormat": "models.dev"
        }
      },
      "models": {}
    }
  }
}
```

---

## 完整配置项手册

所有配置项均位于 `provider.<id>.options.modelsDiscovery`：

| 配置项 | 类型 | 默认值 | 作用说明 |
| :--- | :--- | :--- | :--- |
| **`enabled`** | `boolean` | `true` | 是否对该 Provider 开启自动发现。设置为 `false` 则跳过该 Provider。 |
| **`smartModelName`** | `boolean` | `true` | 是否自动美化模型在 UI 界面上的名称（去除 `deepseek-ai/` 等组织前缀并规范格式）。 |
| **`showProviderName`** | `boolean` | `false` | 是否在模型展示名称后自动追加 `(providerName)`（如 `DeepSeek V3 (CPA)`），**模型 id 保持不变**。别名 `appendProviderName`。 |
| **`modelInfoFormat`** | `string` | `"models.dev"` | 元数据推断规范。可选 `"models.dev"` 等。结合权威数据源为模型匹配精确的上下文、输出限额与基准成本。 |
| **`endpoint`** | `string` | `"/models"` | 获取模型列表的远端相对路径（默认基于 `baseURL` 请求 `/models`）。 |
| **`timeoutMs`** | `number` | `30000` (30秒) | 远端请求超时阈值（毫秒）。网络较慢时可调大，超时自动回退使用本地缓存。 |
| **`models.includeBy`** | `Array<{field, match, equals}>` | `[]` | **高级过滤**：仅包含符合字段条件的模型（如 `[{ "field": "id", "match": "^deepseek" }]`）。 |
| **`models.excludeBy`** | `Array<{field, match, equals}>` | `[]` | **高级过滤**：排除符合字段条件的模型（默认已自动过滤 embedding/rerank/tts 等非对话模型）。 |
| **`rules`** *(增强扩展)* | `Array<Rule>` | `[]` | 用户自定义最高优先级规则库，用于覆盖指定模型的 `context` / `output` / `reasoning`。 |
| **`defaultLimit`** *(增强扩展)*| `object` | `{ context: 131072, output: 8192 }` | 未匹配到任何规则时的安全兜底上限（默认为 128K）。 |

---

## 版本演进与更新记录

详细版本演进记录请见 [CHANGELOG.md](./CHANGELOG.md)。

- **v1.1.0** (2026-09-25)：接入 `models.dev/api.json` 官方参考定价；打通 `compatibility.reasoningField` 推理思考能力与标准推理深度档位（`variants`）；模态过滤与 `capabilities` 全量补齐；缓存升级为 `schemaVersion: 3`。
- **v1.0.4** (2026-09-24)：接入 `models.dev` 权威限额数据库，修复上下文限额被错误归一化的问题；缓存版本化与字段级失败防护。
- **v1.0.3** (2026-09-20)：支持供应商归属标识 (`showProviderName`)。
- **v1.0.2** (2026-09-15)：初始版本发布，支持 OpenCode 2 系统凭据读取与极速冷启动。

---

## 许可证

MIT License © 2026 SenZh
