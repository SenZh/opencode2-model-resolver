# opencode2-model-resolver

专为 **OpenCode 2** 设计的动态模型发现与上下文限制智能注入插件（100% 兼容原版 `opencode-models-discovery` 的配置项）。

---

## 核心特性

1. **自动发现全量模型**：启动时自动扫描已配置的 Provider，向其 `baseURL/models` 端点拉取并注册可用模型列表，无需手动复制填写。
2. **免配 API Key（读取系统凭据）**：优先从 OpenCode 系统凭据存储库（`~/.local/share/opencode/auth.json`）或环境变量中读取 API Key，保证 `opencode.json` 清爽且安全。
3. **元数据自动推断（内置规则库 + models.dev）**：全自动识别 DeepSeek、Gemini、Claude、GPT、GLM、Qwen、Llama 等系列模型，分配精准的真实上下文限制（如 1M / 128K），不再回退为过小的默认值。
4. **纯内存注入（零回写污染）**：所有动态发现的模型及 Limit 参数仅在 OpenCode 运行时注入内存，**绝不会把长篇模型列表回写污染 `opencode.json`**。
5. **本地独立极速缓存**：模型列表与元数据持久化存储于 `~/.cache/opencode2-model-resolver/` 独立目录，保障弱网或离线环境下秒级极速冷启动。
6. **供应商归属标识（可选）**：支持通过 `showProviderName` 在模型展示名后自动追加 `(ProviderName)`（如 `DeepSeek V3 (SiliconFlow)`），多供应商聚合时一目了然，且底层模型 ID 严格保持不变。

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
          "showProviderName": true, // 可选：展示名追加供应商标识 (Custom Provider)，模型 id 保持不变
          "modelInfoFormat": "models.dev",
          "cache": {
            "enabled": true,
            "ttlSeconds": 604800
          }
        }
      },
      "models": {}
    }
  }
}
```

---

## 完整配置项手册（对标原版）

所有配置项均位于 `provider.<id>.options.modelsDiscovery`：

| 配置项 | 类型 | 默认值 | 作用说明 |
| :--- | :--- | :--- | :--- |
| **`enabled`** | `boolean` | `true` | 是否对该 Provider 开启自动发现。设置为 `false` 则跳过该 Provider。 |
| **`smartModelName`** | `boolean` | `true` | 是否自动美化模型在 UI 界面上的名称（去除 `deepseek-ai/` 等组织前缀并规范格式）。 |
| **`showProviderName`** | `boolean` | `false` | 是否在模型展示名称后自动追加 `(providerName)`（如 `DeepSeek V3 (Custom Provider)`），**模型 id 保持不变**。别名 `appendProviderName`。 |
| **`modelInfoFormat`** | `string` | `"models.dev"` | 元数据推断规范。可选 `"models.dev"`、`"litellm"` 等。会结合云端/本地元数据为模型匹配精确的上下文与输出限制。 |
| **`modelInfoEndpoint`** | `string` | `undefined` | 自定义元数据镜像地址。留空时默认请求 `https://models.dev/models.json`。 |
| **`endpoint`** | `string` | `"/models"` | 获取模型列表的远端相对路径（默认基于 `baseURL` 请求 `/models`）。 |
| **`timeoutMs`** | `number` | `30000` (30秒) | 远端请求超时阈值（毫秒）。网络较慢时可调大，超时自动回退使用本地缓存。 |
| **`cache.enabled`** | `boolean` | `true` | 是否开启独立磁盘持久化缓存（存放在 `~/.cache/opencode2-model-resolver/`）。 |
| **`cache.ttlSeconds`** | `number` | `604800` (7天) | 缓存有效期（秒）。未过期时秒级极速冷启动，后台静默拉取更新。 |
| **`models.includeBy`** | `Array<{field, match, equals}>` | `[]` | **原版高级过滤**：仅包含符合字段条件的模型（如 `[{ "field": "id", "match": "^deepseek" }]`）。 |
| **`models.excludeBy`** | `Array<{field, match, equals}>` | `[]` | **原版高级过滤**：排除符合字段条件的模型（默认内置已自动过滤 embedding/rerank 等非对话模型）。 |
| **`rules`** *(增强扩展)* | `Array<Rule>` | `[]` | 用户自定义最高优先级规则库，用于覆盖指定模型的 `context` / `output` / `reasoning`。 |
| **`defaultLimit`** *(增强扩展)*| `object` | `{ context: 131072, output: 8192 }` | 未匹配到任何规则时的安全兜底上限（默认为 128K）。 |

---

## 许可证

MIT License © 2026 SenZh
