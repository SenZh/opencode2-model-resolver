# 接口与数据契约 (Contract) — v2 修正版

## 1. 外部数据源契约
- **URL**: `https://models.dev/api.json`
- **响应格式**: JSON，顶级为 `Record<string, ModelsDevApiProvider>`
- **关键结构**:
  ```ts
  {
    [providerId: string]: {
      models: {
        [modelId: string]: {
          cost?: {
            input: number;      // 美金 / 百万 tokens
            output: number;     // 美金 / 百万 tokens
            cache_read?: number;
            cache_write?: number;
          }
        }
      }
    }
  }
  ```

## 2. 插件内部数据结构契约
```ts
export interface ModelCost {
  input: number;
  output: number;
  cache_read?: number;
  cache_write?: number;
}

export interface CachedModelEntry {
  id: string;
  name: string;
  limit: { context: number; output: number; input?: number };
  reasoning: boolean;
  capabilities: {
    tools: boolean;
    input: string[];
    output: string[];
  };
  cost?: ModelCost;
}

export interface CachedModelsPayload {
  schemaVersion: 3;
  updatedAt: number;
  models: CachedModelEntry[];
}
```

## 3. OpenCode V2 运行时注入契约
遵循 OpenCode 运行时核心 Effect Schema 与 OpenChamber 渲染层契约：
```ts
interface OpenCodeModelCost {
  input: number;
  output: number;
  cache?: {
    read?: number;
    write?: number;
  };
}

interface ModelInfo {
  id: string;
  modelID: string;
  name: string;
  capabilities: {
    tools: boolean;
    input: string[];
    output: string[];
  };
  limit: {
    context: number;
    output: number;
  };
  cost?: OpenCodeModelCost[];
}
```

## 4. 降级与安全边界契约
1. **网络不可用降级**：
   若 `api.json` 请求抛出异常、超时或返回非 200，`fetchModelsDevApiData` 返回 `null`。
   `resolveModelCost` 在 `tables === null` 时统一返回 `undefined`。
2. **防假零与可选性契约**：
   若模型无 `cache_read`，其属性保持 `undefined`，禁止强制填 `0`。
3. **有条件写入契约**：
   仅当 `cached.cost` 解析出有效的非负数值时，才向 `modelDef.cost` 注入包含单元素的数组；缺省时保持原状，严禁盲目清空上游或既有配置。
4. **版本隔离与降级兼容契约**：
   - 注入端 `parseCachedModels` 严格要求 `schemaVersion === 3`。
   - 扫描端 `parseOldCachedModelsForFallback` 兼容 `schemaVersion >= 2`，保障跨版本迁移期间遭遇断网时上下文防护不失效。
