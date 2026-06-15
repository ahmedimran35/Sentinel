import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export interface MCPMarketplaceEntry {
  name: string;
  description: string;
  url: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  category?: string;
  author?: string;
}

const DEFAULT_REGISTRY_URL =
  'https://raw.githubusercontent.com/sentinel-ai/mcp-marketplace/main/registry.json';

const BUILTIN_ENTRIES: MCPMarketplaceEntry[] = [
  {
    name: 'typescript-sdk',
    description: 'TypeScript SDK for building MCP servers with type safety and developer tooling',
    url: 'https://github.com/modelcontextprotocol/typescript-sdk',
    command: 'npx',
    args: ['@modelcontextprotocol/sdk'],
    category: 'sdk',
    author: 'ModelContextProtocol',
  },
  {
    name: 'playwright',
    description: 'Browser automation via Playwright — navigate, click, screenshot, and scrape',
    url: 'https://github.com/microsoft/playwright-mcp',
    command: 'npx',
    args: ['@playwright/mcp'],
    category: 'browser',
    author: 'Microsoft',
  },
  {
    name: 'filesystem',
    description: 'Secure filesystem access with path sandboxing and permission controls',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    category: 'filesystem',
    author: 'ModelContextProtocol',
  },
  {
    name: 'github',
    description: 'GitHub API integration — repos, issues, PRs, code search, workflows',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    category: 'devops',
    author: 'ModelContextProtocol',
  },
  {
    name: 'gitlab',
    description: 'GitLab API integration — projects, MRs, issues, pipelines, snippets',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/gitlab',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gitlab'],
    category: 'devops',
    author: 'ModelContextProtocol',
  },
  {
    name: 'slack',
    description: 'Slack workspace integration — messages, channels, users, reactions',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    category: 'communication',
    author: 'ModelContextProtocol',
  },
  {
    name: 'postgres',
    description: 'PostgreSQL database — query tables, inspect schemas, run read-only queries',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    category: 'database',
    author: 'ModelContextProtocol',
  },
  {
    name: 'sqlite',
    description: 'SQLite database — query, create, and manage local SQLite databases',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite',
    command: 'uvx',
    args: ['mcp-server-sqlite', '--db-path', './data.db'],
    category: 'database',
    author: 'ModelContextProtocol',
  },
  {
    name: 'redis',
    description: 'Redis in-memory data store — keys, values, lists, sets, and pub/sub',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/redis',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-redis'],
    category: 'database',
    author: 'ModelContextProtocol',
  },
  {
    name: 'docker',
    description: 'Docker container management — list, inspect, run, and monitor containers',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/docker',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-docker'],
    category: 'infrastructure',
    author: 'ModelContextProtocol',
  },
  {
    name: 'memory',
    description: 'Persistent memory graph using local knowledge graph storage',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    category: 'memory',
    author: 'ModelContextProtocol',
  },
  {
    name: 'brave-search',
    description: 'Web search via Brave Search API with news, images, and video results',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    category: 'search',
    author: 'ModelContextProtocol',
  },
  {
    name: 'fetch',
    description: 'HTTP fetch tool for making web requests and scraping content',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    category: 'web',
    author: 'ModelContextProtocol',
  },
];

interface MCPConfig {
  [key: string]: {
    command: string;
    args: string[];
    env?: Record<string, string>;
  };
}

function findSentinelConfigPath(): string | null {
  const paths = [
    resolve(process.cwd(), '.sentinel', 'sentinel.json'),
    resolve(process.cwd(), '.sentinel.json'),
    resolve(process.cwd(), 'sentinel.json'),
  ];
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return null;
}

function loadMCPConfig(configPath: string): MCPConfig {
  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const mcp = parsed.mcp;
    if (mcp && typeof mcp === 'object' && !Array.isArray(mcp)) {
      return mcp as MCPConfig;
    }
    return {};
  } catch {
    return {};
  }
}

export class MCPMarketplace {
  private entries: MCPMarketplaceEntry[] = [...BUILTIN_ENTRIES];

  /** Fetch registry from remote URL, falling back to built-in list on failure */
  async fetchRegistry(url?: string): Promise<MCPMarketplaceEntry[]> {
    const registryUrl = url ?? DEFAULT_REGISTRY_URL;
    try {
      const response = await fetch(registryUrl);
      if (!response.ok) {
        return this.list();
      }
      const text = await response.text();
      let parsed: MCPMarketplaceEntry[];
      try {
        parsed = JSON.parse(text) as MCPMarketplaceEntry[];
      } catch {
        return this.list();
      }
      if (!Array.isArray(parsed)) {
        return this.list();
      }
      this.entries = parsed;
      return this.entries;
    } catch {
      return this.list();
    }
  }

  /** Install a marketplace entry into the local MCP config */
  async install(name: string, configPath?: string): Promise<void> {
    const entry = this.entries.find((e) => e.name === name);
    if (!entry) {
      throw new Error(`Marketplace entry "${name}" not found`);
    }

    const targetConfigPath = configPath ?? findSentinelConfigPath();
    if (!targetConfigPath) {
      // Create default config
      const defaultPath = resolve(process.cwd(), '.sentinel', 'sentinel.json');
      mkdirSync(resolve(defaultPath, '..'), { recursive: true });
      const config: Record<string, unknown> = {
        mcp: {
          [entry.name]: {
            command: entry.command,
            args: entry.args,
            ...(entry.env ? { env: entry.env } : {}),
          },
        },
      };
      writeFileSync(defaultPath, JSON.stringify(config, null, 2), 'utf-8');
      return;
    }

    const dir = targetConfigPath.substring(0, targetConfigPath.lastIndexOf('/'));
    if (dir) {
      mkdirSync(dir, { recursive: true });
    }

    const config = loadMCPConfig(targetConfigPath);
    config[name] = {
      command: entry.command,
      args: entry.args,
      ...(entry.env ? { env: entry.env } : {}),
    };

    // Rewrite the config file with updated mcp section
    const fullConfig = JSON.parse(readFileSync(targetConfigPath, 'utf-8')) as Record<string, unknown>;
    fullConfig.mcp = config;
    writeFileSync(targetConfigPath, JSON.stringify(fullConfig, null, 2), 'utf-8');
  }

  /** List all available entries */
  list(): MCPMarketplaceEntry[] {
    return [...this.entries];
  }

  /** Search entries by name, description, category, or author */
  search(query: string): MCPMarketplaceEntry[] {
    const q = query.toLowerCase();
    return this.entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        (e.category ?? '').toLowerCase().includes(q) ||
        (e.author ?? '').toLowerCase().includes(q),
    );
  }

  getDefaultRegistryUrl(): string {
    return DEFAULT_REGISTRY_URL;
  }
}
