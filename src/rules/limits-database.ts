import type { ModelLimit, ModelRule, RawOpenAIModel } from "../types.js";
import type { ModelsDevModel } from "../fetcher/models-dev.js";
import { lookupModelsDev } from "../fetcher/models-dev.js";

/**
 * 默认兜底限制（128K context, 8K output）
 */
export const FALLBACK_MODEL_LIMIT: ModelLimit = {
  context: 131072,
  output: 8192,
};

interface PredefinedModelRule {
  pattern: RegExp;
  limit: ModelLimit;
  reasoning?: boolean;
}

/**
 * 常见流行大模型的精准上下文规则库
 */
const KNOWN_MODEL_RULES: PredefinedModelRule[] = [
  // --- DeepSeek 系列 ---
  {
    pattern: /deepseek-v4(?:\.\d+)?-flash/i,
    limit: { context: 1048576, output: 65536 },
  },
  {
    pattern: /deepseek-(?:r1|v3|chat|coder)/i,
    limit: { context: 131072, output: 8192 },
    reasoning: true,
  },
  {
    pattern: /deepseek/i,
    limit: { context: 131072, output: 8192 },
  },

  // --- Qwen / 通义千问系列 ---
  {
    pattern: /qwen(?:2\.5|3)?-coder-(?:32b|7b|14b|3b)/i,
    limit: { context: 131072, output: 16384 },
  },
  {
    pattern: /qwen(?:2\.5|3)?-(?:72b|32b|14b|7b)/i,
    limit: { context: 131072, output: 8192 },
  },
  {
    pattern: /qwen.*-(?:1m|1000k)/i,
    limit: { context: 1048576, output: 8192 },
  },
  {
    pattern: /qwen(?:2\.5|2)/i,
    limit: { context: 131072, output: 8192 },
  },
  {
    pattern: /qwen1\.5/i,
    limit: { context: 32768, output: 4096 },
  },
  {
    pattern: /qwen/i,
    limit: { context: 32768, output: 4096 },
  },

  // --- GLM / 智谱清言系列 ---
  {
    pattern: /glm-5/i,
    limit: { context: 200000, output: 16384 },
    reasoning: true,
  },
  {
    pattern: /glm-4(?:-plus|-air|-flash|-long)?/i,
    limit: { context: 131072, output: 4096 },
  },
  {
    pattern: /glm-4/i,
    limit: { context: 131072, output: 4096 },
  },

  // --- Kimi / Moonshot 系列 ---
  {
    pattern: /moonshot-v1-128k|kimi.*128k/i,
    limit: { context: 131072, output: 8192 },
  },
  {
    pattern: /moonshot-v1-32k|kimi.*32k/i,
    limit: { context: 32768, output: 8192 },
  },
  {
    pattern: /kimi|k2/i,
    limit: { context: 200000, output: 8192 },
  },

  // --- Llama 系列 ---
  {
    pattern: /llama-3\.[123]/i,
    limit: { context: 131072, output: 8192 },
  },
  {
    pattern: /llama-3/i,
    limit: { context: 8192, output: 4096 },
  },
  {
    pattern: /llama-2/i,
    limit: { context: 4096, output: 2048 },
  },

  // --- Mistral / Codestral 系列 ---
  {
    pattern: /codestral/i,
    limit: { context: 32768, output: 8192 },
  },
  {
    pattern: /mistral-large|pixtral-large/i,
    limit: { context: 131072, output: 8192 },
  },
  {
    pattern: /mixtral-8x22b/i,
    limit: { context: 65536, output: 8192 },
  },
  {
    pattern: /mixtral-8x7b|mistral-7b/i,
    limit: { context: 32768, output: 4096 },
  },

  // --- Claude 系列 ---
  {
    pattern: /claude.*(?:1m|1000k)/i,
    limit: { context: 1000000, output: 16384 },
  },
  {
    pattern: /claude/i,
    limit: { context: 200000, output: 8192 },
  },

  // --- OpenAI GPT & o-series 系列 ---
  {
    pattern: /^o[13](?:-mini|-preview)?$/i,
    limit: { context: 200000, output: 65536 },
    reasoning: true,
  },
  {
    pattern: /gpt-5/i,
    limit: { context: 131072, output: 16384 },
  },
  {
    pattern: /gpt-4o(?:-mini)?/i,
    limit: { context: 131072, output: 16384 },
  },
  {
    pattern: /gpt-4-turbo/i,
    limit: { context: 131072, output: 4096 },
  },
  {
    pattern: /gpt-4/i,
    limit: { context: 8192, output: 4096 },
  },
  {
    pattern: /gpt-3\.5-turbo/i,
    limit: { context: 16384, output: 4096 },
  },

  // --- Google Gemini 系列 ---
  {
    pattern: /gemini-(?:3\.[78]|2\.[05])-flash/i,
    limit: { context: 1048576, output: 65536 },
  },
  {
    pattern: /gemini/i,
    limit: { context: 1048576, output: 8192 },
  },

  // --- Grok (xAI) 系列 ---
  {
    pattern: /grok/i,
    limit: { context: 131072, output: 8192 },
  },

  // --- MiniMax / abab 系列 ---
  {
    pattern: /abab(?:6\.5|7)/i,
    limit: { context: 245760, output: 4096 },
  },

  // --- Yi (零一万物) 系列 ---
  {
    pattern: /yi-.*200k/i,
    limit: { context: 204800, output: 4096 },
  },
  {
    pattern: /yi-large|yi-34b/i,
    limit: { context: 32768, output: 4096 },
  },
];

/**
 * 从模型名称中动态识别显式带有 k/m 格式的上下文标记
 * 例如：qwen-128k, llama-32k, mixtral-64k, chat-1m
 */
function extractContextFromExplicitName(modelId: string): number | null {
  // 匹配类似 128k, 256k, 32k, 200k, 1m
  const match = modelId.match(/[-_](\d+)(k|m)(?:[-_]|$)/i);
  if (match) {
    const val = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    if (unit === "k") {
      return val * 1024;
    }
    if (unit === "m") {
      return val * 1024 * 1024;
    }
  }
  return null;
}

/**
 * 核心解析函数：智能计算并返回模型的最终 context 与 output limit
 */
export function resolveModelLimit(
  rawModel: RawOpenAIModel,
  customRules?: ModelRule[],
  customDefaultLimit?: Partial<ModelLimit>
): { limit: ModelLimit; reasoning?: boolean } {
  const modelId = rawModel.id;

  // 1. 用户自定义规则（最高优先级）
  if (customRules && customRules.length > 0) {
    for (const rule of customRules) {
      try {
        const regex = new RegExp(rule.match, "i");
        if (regex.test(modelId)) {
          const base = customDefaultLimit
            ? { ...FALLBACK_MODEL_LIMIT, ...customDefaultLimit }
            : FALLBACK_MODEL_LIMIT;
          return {
            limit: {
              context: rule.limit?.context ?? base.context,
              output: rule.limit?.output ?? base.output,
              input: rule.limit?.input ?? rule.limit?.context,
            },
            reasoning: rule.reasoning,
          };
        }
      } catch {
        // 如果传入的不是有效正则，退化为字符串包含判断
        if (modelId.toLowerCase().includes(rule.match.toLowerCase())) {
          const base = customDefaultLimit
            ? { ...FALLBACK_MODEL_LIMIT, ...customDefaultLimit }
            : FALLBACK_MODEL_LIMIT;
          return {
            limit: {
              context: rule.limit?.context ?? base.context,
              output: rule.limit?.output ?? base.output,
              input: rule.limit?.input ?? rule.limit?.context,
            },
            reasoning: rule.reasoning,
          };
        }
      }
    }
  }

  // 2. 从服务端元数据中识别已知扩展字段（vLLM, Ollama, LiteLLM 等）
  const serverContext =
    rawModel.max_model_len ||
    rawModel.context_length ||
    rawModel.context_window ||
    rawModel.max_input_tokens;

  const serverOutput =
    rawModel.max_output_tokens ||
    rawModel.max_tokens;

  if (serverContext && serverContext > 1024) {
    return {
      limit: {
        context: serverContext,
        output: serverOutput && serverOutput > 0 ? serverOutput : 8192,
      },
    };
  }

  // 3. 从模型名自身提取显式上下文数字（如 custom-256k, kimi-1m, qwen-128k）
  const explicitContext = extractContextFromExplicitName(modelId);
  if (explicitContext && explicitContext >= 4096) {
    return {
      limit: {
        context: explicitContext,
        output: 8192,
      },
      reasoning: /-reasoner|-thinking|reasoning/i.test(modelId),
    };
  }

  // 4. 匹配常见预定义规则库
  for (const rule of KNOWN_MODEL_RULES) {
    if (rule.pattern.test(modelId)) {
      return {
        limit: { ...rule.limit },
        reasoning: rule.reasoning,
      };
    }
  }

  // 5. 使用兜底默认值
  const defaultLimit = {
    ...FALLBACK_MODEL_LIMIT,
    ...(customDefaultLimit || {}),
  };

  return {
    limit: defaultLimit,
    reasoning: /-reasoner|-thinking|reasoning/i.test(modelId),
  };
}

// ---------------------------------------------------------------------------
// 权威 limit 解析（models.dev 优先，规则库兜底）
// ---------------------------------------------------------------------------

export interface AuthoritativeLimitOptions {
  /** models.dev 权威数据库；未提供或为空时仅使用本地规则库 */
  modelsDevCache?: Map<string, ModelsDevModel>;
  /** 用户自定义规则（最高优先级，透传给 resolveModelLimit） */
  rules?: ModelRule[];
  /** 未匹配到已知模型时的兜底限制 */
  defaultLimit?: Partial<ModelLimit>;
}

export interface AuthoritativeLimitResult {
  limit: ModelLimit;
  reasoning?: boolean;
  /** 是否从 models.dev 命中了「有效」limit（context/output/input 任一为正） */
  matchedModelsDev: boolean;
}

/**
 * 解析模型的权威 limit：models.dev 优先，本地规则库兜底。
 *
 * 合并语义（关键）：
 *   - 所有数值字段使用 `value > 0` 判定，0 视为「无效/未提供」→ 回落规则值。
 *     禁止使用 `||`，避免 models.dev 的 0（如生图模型）被误吞或误保留。
 *   - reasoning 使用布尔 OR，无 falsy 陷阱。
 *
 * 本函数不修改 resolveModelLimit 的既有行为，仅在其结果之上叠加 models.dev 权威层。
 */
export function resolveAuthoritativeLimit(
  rawModel: RawOpenAIModel,
  options?: AuthoritativeLimitOptions
): AuthoritativeLimitResult {
  const ruleResult = resolveModelLimit(
    rawModel,
    options?.rules,
    options?.defaultLimit
  );
  const ruleLimit = ruleResult.limit;

  const devInfo =
    options?.modelsDevCache && options.modelsDevCache.size > 0
      ? lookupModelsDev(rawModel.id, options.modelsDevCache)
      : undefined;

  const devContext = devInfo?.limit?.context;
  const devOutput = devInfo?.limit?.output;
  const devInput = devInfo?.limit?.input;

  const hasDevContext = typeof devContext === "number" && devContext > 0;
  const hasDevOutput = typeof devOutput === "number" && devOutput > 0;
  const hasDevInput = typeof devInput === "number" && devInput > 0;

  const limit: ModelLimit = {
    context: hasDevContext ? devContext : ruleLimit.context,
    output: hasDevOutput ? devOutput : ruleLimit.output,
  };

  if (hasDevInput || (typeof ruleLimit.input === "number" && ruleLimit.input > 0)) {
    limit.input = hasDevInput ? devInput : ruleLimit.input;
  }

  return {
    limit,
    reasoning: devInfo?.reasoning || ruleResult.reasoning,
    // 任一字段命中 models.dev 即视为「拿到了权威值」，避免 context=0/output>0 被误判为未命中
    matchedModelsDev: hasDevContext || hasDevOutput || hasDevInput,
  };
}
