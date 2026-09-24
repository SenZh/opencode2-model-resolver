export interface ModelLimit {
  context: number;
  output: number;
  input?: number;
}

export interface ModelRule {
  match: string; // 正则表达式或字符串包含
  limit?: Partial<ModelLimit>;
  name?: string;
  reasoning?: boolean;
}

export interface ProviderTarget {
  id: string;
  name?: string;
  baseURL: string;
  apiKey?: string;
  endpoint?: string; // 默认 /models 或 /v1/models
  headers?: Record<string, string>;
  defaultLimit?: Partial<ModelLimit>;
  include?: string[];
  exclude?: string[];
  /**
   * 是否在模型展示名称后追加 (providerName)
   */
  showProviderName?: boolean;
  /**
   * showProviderName 的别名
   */
  appendProviderName?: boolean;
}

export interface PluginOptions {
  /**
   * 手动指定的 Provider 探测列表
   */
  providers?: ProviderTarget[];

  /**
   * 是否自动探测在 OpenCode 配置中已有 baseURL 的 OpenAI-compatible providers
   * 默认为 true
   */
  autoDiscoverConfiguredProviders?: boolean;

  /**
   * 全局默认模型上下文限制（未匹配到已知模型时的回退）
   * 默认 context: 131072 (128K), output: 8192
   */
  defaultLimit?: Partial<ModelLimit>;

  /**
   * 自定义模型规则覆盖
   */
  rules?: ModelRule[];

  /**
   * 全局允许的模型（支持通配符或正则字符串，空则全部允许）
   */
  include?: string[];

  /**
   * 全局排除的模型关键词/正则（如 embedding, rerank 等）
   */
  exclude?: string[];

  /**
   * 是否自动美化模型展示名
   * 默认为 true
   */
  smartModelName?: boolean;

  /**
   * 是否在模型展示名称后追加 (providerName)，如 "DeepSeek V3 (SiliconFlow)"，模型 id 保持不变
   * 默认为 false
   */
  showProviderName?: boolean;

  /**
   * showProviderName 的别名
   */
  appendProviderName?: boolean;

  /**
   * 网络请求超时时间（毫秒）
   * 默认 5000ms
   */
  timeoutMs?: number;
}

/**
 * OpenAI /v1/models 接口返回的单个模型结构
 */
export interface RawOpenAIModel {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
  // 常见扩展字段（vLLM, Ollama, LiteLLM, OneAPI）
  max_model_len?: number;
  context_length?: number;
  context_window?: number;
  max_tokens?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  mode?: string;
  [key: string]: unknown;
}

/**
 * OpenCode 2 Plugin Context 规范接口
 */
export interface OpenCodeV2Context {
  options?: PluginOptions;
  app?: {
    version: string;
    [key: string]: unknown;
  };
  location?: {
    directory: string;
    [key: string]: unknown;
  };
  model?: {
    list?: (providerID?: string) => Promise<any[] | { data: any[] }>;
    default?: () => Promise<any>;
    transform?: (callback: (editor: any) => void) => Promise<{ dispose: () => Promise<void> }>;
    reload?: () => Promise<void>;
  };
  provider?: {
    list?: () => Promise<any[] | { data: any[] }>;
    get?: (input: { providerID: string }) => Promise<any>;
    transform?: (callback: (editor: any) => void) => Promise<{ dispose: () => Promise<void> }>;
    reload?: () => Promise<void>;
  };
  catalog?: {
    transform: (fn: (catalog: any) => void | Promise<void>) => Promise<unknown>;
    reload?: () => Promise<void>;
  };
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpenCodeV2CatalogEditor {
  provider: {
    list: () => unknown[];
    get: (providerID: string) => unknown;
    update: (providerID: string, fn: (provider: any) => void) => void;
    remove: (providerID: string) => void;
  };
  model: {
    list?: (providerID?: string) => any[];
    get: (providerID: string, modelID: string) => unknown;
    update: (providerID: string, modelID: string, fn: (model: any) => void) => void;
    remove: (providerID: string, modelID: string) => void;
    default?: {
      get: () => unknown;
      set: (providerID: string, modelID: string) => void;
    };
  };
}
