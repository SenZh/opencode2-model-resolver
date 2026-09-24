import { promises as fs } from "node:fs";
import path from "node:path";

function getAuthFilePath(): string | undefined {
  if (process.env.OPENCODE_AUTH_PATH) {
    return process.env.OPENCODE_AUTH_PATH;
  }
  const home = process.env.USERPROFILE || process.env.HOME || "";
  if (!home) return undefined;
  return path.join(home, ".local", "share", "opencode", "auth.json");
}

/**
 * 从 OpenCode 认证存储中自动读取指定 Provider 的 API Key
 * 优先级：
 * 1. 显式指定的 explicitKey
 * 2. OPENCODE_AUTH_CONTENT 环境变量
 * 3. ~/.local/share/opencode/auth.json 文件
 */
export async function resolveProviderApiKey(
  providerId: string,
  explicitKey?: string
): Promise<string | undefined> {
  if (explicitKey && typeof explicitKey === "string" && explicitKey.trim().length > 0) {
    return explicitKey.trim();
  }

  const normalized = providerId.trim().toLowerCase().replace(/\/+$/, "");

  // 1. 检查环境变量
  if (process.env.OPENCODE_AUTH_CONTENT) {
    try {
      const auths = JSON.parse(process.env.OPENCODE_AUTH_CONTENT);
      const auth = auths[providerId] || auths[normalized];
      if (auth && typeof auth.key === "string" && auth.key.trim().length > 0) {
        return auth.key.trim();
      }
    } catch {
      // ignore
    }
  }

  // 2. 检查本地 auth.json
  const authPath = getAuthFilePath();
  if (authPath) {
    try {
      const content = await fs.readFile(authPath, "utf8");
      const auths = JSON.parse(content);
      const auth = auths[providerId] || auths[normalized];
      if (auth && typeof auth.key === "string" && auth.key.trim().length > 0) {
        return auth.key.trim();
      }
    } catch {
      // ignore file not found
    }
  }

  return undefined;
}
