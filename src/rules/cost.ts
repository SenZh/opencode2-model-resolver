/**
 * 模型官方基准价格匹配解析器
 */
import type { ModelCost, PreIndexedCostTables } from "../fetcher/models-dev-api.js";

/** 合法的前缀单词分隔符 */
const PREFIX_BOUNDARY_DELIMITERS = new Set(["-", "_", ":", "/"]);

/**
 * 校验前缀匹配是否落在合法的单词边界上。
 * 例如：target="grok-4.7-build-fast", prefix="grok-4.7" -> 紧随字符为 '-'，合法。
 *      target="model-11", prefix="model-1" -> 紧随字符为 '1'，非法拒绝。
 */
function isValidPrefixBoundary(target: string, prefix: string): boolean {
  if (target.length <= prefix.length) return false;
  const nextChar = target.charAt(prefix.length);
  return PREFIX_BOUNDARY_DELIMITERS.has(nextChar);
}

/**
 * 解析并匹配模型的官方参考基准定价
 *
 * @param modelId 待匹配的模型 ID（例如 cpa/gemini-3.8-flash 或 grok-4.7-build-fast）
 * @param tables 预构建的索引表（若为 null 说明价格源不可用，安全回退 undefined）
 */
export function resolveModelCost(
  modelId: string,
  tables: PreIndexedCostTables | null | undefined
): ModelCost | undefined {
  if (!tables || !modelId) return undefined;

  const cleanId = modelId.toLowerCase().trim();
  const parts = cleanId.split("/");
  const tailId = parts[parts.length - 1];

  // 1. 官方原厂白名单精确匹配 (O(1))
  const official = tables.officialMap.get(cleanId) ?? tables.officialMap.get(tailId);
  if (official) return { ...official };

  // 2. 全局提供商精确匹配 (O(1))
  const globalExact = tables.globalExactMap.get(cleanId);
  if (globalExact) return { ...globalExact };

  // 3. 全局提供商尾段匹配 (O(1))
  const tail = tables.tailMap.get(tailId);
  if (tail) return { ...tail };

  // 4. 单词边界前缀模糊匹配 (最长公共前缀优先)
  for (const candidate of tables.prefixCandidates) {
    if (tailId.startsWith(candidate.prefix) && isValidPrefixBoundary(tailId, candidate.prefix)) {
      return { ...candidate.cost };
    }
    if (cleanId.startsWith(candidate.prefix) && isValidPrefixBoundary(cleanId, candidate.prefix)) {
      return { ...candidate.cost };
    }
  }

  return undefined;
}
