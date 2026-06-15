import type { Tool } from '@sentinel/shared';
import type { SentinelConfig } from './config-schema.js';

function wildcardMatch(value: string, pattern: string): boolean {
  const regexStr = '^' + pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.') + '$';
  return new RegExp(regexStr).test(value);
}

export async function getMcpTools(
  config?: SentinelConfig,
): Promise<Tool[]> {
  try {
    const { MCPRegistry } = await import('@sentinel/mcp');
    const registry = new MCPRegistry();
    await registry.connectAll();
    let tools = await registry.getTools();

    // Apply per-server tool enable/disable from config
    if (config?.tools) {
      const toolRules = config.tools;
      tools = tools.filter((t) => {
        for (const [pattern, enabled] of Object.entries(toolRules)) {
          if (enabled === false && wildcardMatch(t.name, pattern)) {
            return false;
          }
        }
        return true;
      });
    }

    return tools;
  } catch {
    return [];
  }
}
