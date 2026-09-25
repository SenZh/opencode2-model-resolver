import type { RawOpenAIModel } from "../types.js";
import type { ModelsDevModel } from "../fetcher/models-dev.js";

/**
 * 默认排除的非对话模型关键词（嵌入、重排序、生图、语音等）
 */
const DEFAULT_EXCLUDE_KEYWORDS = [
  "embedding",
  "embed",
  "rerank",
  "reranker",
  "bge-",
  "tts",
  "whisper",
  "speech",
  "audio",
  "dall-e",
  "flux",
  "stable-diffusion",
  "moderation",
  "guard",
];

/**
 * 无 models.dev 模态数据时，用于识别纯生成模型（非对话）的 id 关键词。
 * 仅在缺乏权威模态数据时启用，避免误伤能对话的多模态模型。
 */
const NON_CHAT_ID_PATTERNS: RegExp[] = [
  /-image(?:-|$)/i, // gpt-image-2.5, gemini-*-image
  /^gpt-image/i,
  /imagine/i, // grok-imagine-image-2.0
  /-tts(?:-|$)/i,
  /-video(?:-|$)/i,
  /^dall-e/i,
];

/**
 * 模型能力描述（对应 OpenCode V2 的 Model.Capabilities）
 */
export interface ModelCapabilities {
  tools: boolean;
  input: string[];
  output: string[];
}

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  tools: false,
  input: ["text"],
  output: ["text"],
};

/**
 * 是否具备可用的模态数据（非空 output 数组才算有）。
 * 统一「空数组」与「undefined」的语义：二者均视为无数据。
 */
function hasModalities(info?: ModelsDevModel): boolean {
  return Array.isArray(info?.modalities?.output) && info.modalities.output.length > 0;
}

/**
 * 将 models.dev 的模态信息映射为 OpenCode V2 的 capabilities。
 * 无数据时回落默认值。
 */
export function resolveCapabilities(info?: ModelsDevModel): ModelCapabilities {
  if (!info) return { ...DEFAULT_CAPABILITIES };

  const input =
    Array.isArray(info.modalities?.input) && info.modalities.input.length > 0
      ? [...info.modalities.input]
      : [...DEFAULT_CAPABILITIES.input];
  const output = hasModalities(info)
    ? [...info.modalities!.output!]
    : [...DEFAULT_CAPABILITIES.output];

  return {
    tools: info.tool_call === true,
    input,
    output,
  };
}

/**
 * 判断通配符或正则是否匹配
 */
function matchPattern(pattern: string, text: string): boolean {
  if (pattern === "*") return true;
  try {
    const reg = new RegExp(pattern, "i");
    return reg.test(text);
  } catch {
    return text.toLowerCase().includes(pattern.toLowerCase());
  }
}

/**
 * 判断模型是否应当保留并注入
 */
export function shouldIncludeModel(
  model: RawOpenAIModel,
  include?: string[],
  exclude?: string[],
  modelsDevInfo?: ModelsDevModel
): boolean {
  const modelId = model.id;

  // 1. 如果原始模型对象显式标明了 mode 不是 chat（如 LiteLLM 返回）
  if (model.mode && typeof model.mode === "string" && model.mode !== "chat") {
    return false;
  }

  // 2. 检查默认排除关键词
  const lowerId = modelId.toLowerCase();
  for (const keyword of DEFAULT_EXCLUDE_KEYWORDS) {
    if (lowerId.includes(keyword)) {
      return false;
    }
  }

  // 3. 非对话模型过滤
  if (hasModalities(modelsDevInfo)) {
    // 有权威模态数据：输出不含 text 即为纯生成模型（生图/生视频/纯音频）
    if (!modelsDevInfo!.modalities!.output!.includes("text")) {
      return false;
    }
  } else {
    // 无权威模态数据：用 id 关键词兜底（仅在此时启用，避免误伤多模态模型）
    for (const pattern of NON_CHAT_ID_PATTERNS) {
      if (pattern.test(modelId)) {
        return false;
      }
    }
  }

  // 4. 检查用户显式排除
  if (exclude && exclude.length > 0) {
    for (const pattern of exclude) {
      if (matchPattern(pattern, modelId)) {
        return false;
      }
    }
  }

  // 5. 检查用户显式包含（如果配置了 include）
  if (include && include.length > 0) {
    let matched = false;
    for (const pattern of include) {
      if (matchPattern(pattern, modelId)) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      return false;
    }
  }

  return true;
}

/**
 * 格式化更易读的模型展示名
 */
export function formatSmartModelName(modelId: string): string {
  // 去除组织前缀，如 "deepseek-ai/DeepSeek-V3" -> "DeepSeek-V3"
  const cleanId = modelId.includes("/") ? modelId.split("/").pop()! : modelId;

  // 转换常见短横线连词为首字母大写
  return cleanId
    .split("-")
    .map((part) => {
      if (!part) return "";
      const lower = part.toLowerCase();
      if (lower === "gpt") return "GPT";
      if (lower === "glm") return "GLM";
      return part[0].toUpperCase() + part.slice(1);
    })
    .join(" ");
}

/**
 * 在模型名称末尾追加供应商名称，例如 "DeepSeek V3 (Custom Provider)"
 * 如果已有对应后缀则不会重复追加
 */
export function appendProviderNameToModelName(name: string, providerName?: string): string {
  if (!providerName || typeof providerName !== "string") return name;
  const trimmed = providerName.trim();
  if (!trimmed) return name;
  const suffix = `(${trimmed})`;
  if (name.endsWith(suffix) || name.endsWith(` ${suffix}`)) {
    return name;
  }
  return `${name} ${suffix}`;
}

