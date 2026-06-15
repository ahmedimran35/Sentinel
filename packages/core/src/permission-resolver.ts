export type PermissionAction = 'allow' | 'ask' | 'deny';

export type ToolPermissionLevel = 'allow' | 'ask' | 'deny';

export interface PerToolPermission {
  tool: string;
  permission: ToolPermissionLevel;
}

export interface PermissionRule {
  patterns: Array<{ pattern: string; action: PermissionAction }>;
  defaultAction: PermissionAction;
}

export interface PermissionConfig {
  '*'?: PermissionAction;
  read?: PermissionAction | Record<string, PermissionAction>;
  edit?: PermissionAction | Record<string, PermissionAction>;
  bash?: PermissionAction | Record<string, PermissionAction>;
  glob?: PermissionAction | Record<string, PermissionAction>;
  grep?: PermissionAction | Record<string, PermissionAction>;
  task?: PermissionAction | Record<string, PermissionAction>;
  skill?: PermissionAction | Record<string, PermissionAction>;
  lsp?: PermissionAction;
  question?: PermissionAction;
  webfetch?: PermissionAction | Record<string, PermissionAction>;
  websearch?: PermissionAction;
  external_directory?: PermissionAction | Record<string, PermissionAction>;
  doom_loop?: PermissionAction;
  todowrite?: PermissionAction;
  perTool?: PerToolPermission[];
  defaultLevel?: ToolPermissionLevel;
  [key: string]: unknown;
}

export const KNOWN_TOOLS = [
  'bash', 'read', 'edit', 'glob', 'grep', 'write',
  'task', 'skill', 'lsp', 'question', 'webfetch',
  'websearch', 'external_directory', 'doom_loop', 'todowrite',
] as const;

export class PermissionResolver {
  constructor(private config: PermissionConfig) {}

  resolve(toolName: string, input?: string): PermissionAction {
    const raw = this.config[toolName];

    if (raw !== undefined && raw !== null && typeof raw === 'object') {
      const patternMap = raw as Record<string, PermissionAction>;

      if (input !== undefined) {
        const entries = Object.entries(patternMap).filter(([p]) => p !== '*');
        entries.sort(([a], [b]) => b.length - a.length);
        for (const [pattern, action] of entries) {
          if (this.matchPattern(input, pattern)) {
            return action;
          }
        }

        if ('*' in patternMap) {
          return patternMap['*']!;
        }
      } else {
        if ('*' in patternMap) {
          return patternMap['*']!;
        }
      }
    }

    if (typeof raw === 'string') {
      return raw as PermissionAction;
    }

    const globalDefault = this.config['*'];
    if (typeof globalDefault === 'string') {
      return globalDefault;
    }

    return 'ask';
  }

  matchPattern(input: string, pattern: string): boolean {
    const normalizedInput = this.expandHome(input);
    const normalizedPattern = this.expandHome(pattern);
    const regex = new RegExp(`^${this.globToRegex(normalizedPattern)}$`);
    return regex.test(normalizedInput);
  }

  getEffectiveConfig(agentPermission?: PermissionConfig): PermissionConfig {
    if (!agentPermission) {
      return { ...this.config } as PermissionConfig;
    }

    const result: Record<string, unknown> = { ...this.config };

    for (const [key, agentValue] of Object.entries(agentPermission)) {
      if (agentValue === undefined) continue;

      const globalValue = this.config[key];

      if (
        typeof agentValue === 'object' && agentValue !== null &&
        typeof globalValue === 'object' && globalValue !== null
      ) {
        result[key] = {
          ...(globalValue as Record<string, unknown>),
          ...(agentValue as Record<string, unknown>),
        };
      } else {
        result[key] = agentValue;
      }
    }

    return result as PermissionConfig;
  }

  private expandHome(filepath: string): string {
    if (filepath.startsWith('~/')) {
      const home = process.env.HOME;
      if (home) {
        return home.replace(/\/+$/, '') + '/' + filepath.slice(2);
      }
    }
    return filepath;
  }

  private globToRegex(pattern: string): string {
    let result = '';
    for (let i = 0; i < pattern.length; i++) {
      const ch = pattern[i]!;
      if (ch === '*') {
        result += '.*';
      } else if (ch === '?') {
        result += '.';
      } else if (/[.+^${}()|[\]\\]/.test(ch)) {
        result += '\\' + ch;
      } else {
        result += ch;
      }
    }
    return result;
  }

  getToolPermission(toolName: string): ToolPermissionLevel {
    const perTool = this.config.perTool;
    if (perTool && perTool.length > 0) {
      const exact = perTool.find(p => p.tool === toolName);
      if (exact) return exact.permission;
      for (const entry of perTool) {
        if (this.matchToolPattern(toolName, entry.tool)) {
          return entry.permission;
        }
      }
    }
    return this.config.defaultLevel ?? 'ask';
  }

  isToolAutoApproved(toolName: string): boolean {
    return this.getToolPermission(toolName) === 'allow';
  }

  private matchToolPattern(name: string, pattern: string): boolean {
    const regex = new RegExp(`^${this.globToRegex(pattern)}$`);
    return regex.test(name);
  }
}

export const DEFAULT_PERMISSIONS: PermissionConfig = {
  '*': 'allow',
  doom_loop: 'ask',
  external_directory: 'ask',
  read: {
    '*.env.example': 'allow',
    '*.env.*': 'deny',
    '*.env': 'deny',
    '*': 'allow',
  },
};
