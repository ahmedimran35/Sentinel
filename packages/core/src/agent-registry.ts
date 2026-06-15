import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Agent, AgentConfig, AgentMode } from './agent-system.js';

export class AgentRegistry {
  private agents: Map<string, Agent> = new Map();
  private projectRoot: string;
  private defaultAgentName: string = 'build';

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot ? resolve(projectRoot) : process.cwd();
  }

  loadBuiltinAgents(): void {
    const builtins: { name: string; config: AgentConfig }[] = [
      {
        name: 'build',
        config: {
          description: 'Full tool access for implementing changes',
          mode: 'primary',
          tools: { edit: true, bash: true, read: true, glob: true, grep: true, todo: true, notify: true, mcp: true },
        },
      },
      {
        name: 'plan',
        config: {
          description: 'Read-only analysis mode',
          mode: 'primary',
          tools: { edit: false, bash: false, read: true, glob: true, grep: true, todo: true, notify: true, mcp: true },
          permission: { edit: 'deny', bash: 'deny' },
        },
      },
      {
        name: 'general',
        config: {
          description: 'General-purpose subagent with full tool access',
          mode: 'subagent',
          tools: { edit: true, bash: true, read: true, glob: true, grep: true, notify: true, mcp: true, todo: false },
        },
      },
      {
        name: 'explore',
        config: {
          description: 'Fast read-only file exploration',
          mode: 'subagent',
          tools: { edit: false, bash: false, read: true, glob: true, grep: true, todo: false, notify: false, mcp: false },
          temperature: 0.1,
          steps: 20,
        },
      },
      {
        name: 'scout',
        config: {
          description: 'External documentation research',
          mode: 'subagent',
          tools: { edit: false, bash: false, read: true, glob: true, grep: false, todo: false, notify: false, mcp: false, web: true },
          temperature: 0.3,
          steps: 15,
        },
      },
      {
        name: 'compaction',
        config: {
          description: 'Context compaction for long sessions',
          mode: 'primary',
          hidden: true,
          tools: { read: true, edit: true },
          steps: 5,
        },
      },
      {
        name: 'title',
        config: {
          description: 'Generate session titles',
          mode: 'primary',
          hidden: true,
          tools: { read: true },
          steps: 3,
        },
      },
      {
        name: 'summary',
        config: {
          description: 'Session summarization',
          mode: 'primary',
          hidden: true,
          tools: { read: true, edit: true },
          steps: 5,
        },
      },
    ];

    for (const { name, config } of builtins) {
      this.agents.set(name, { name, config, source: 'builtin' });
    }
  }

  loadFromConfig(config: Record<string, AgentConfig>): void {
    for (const [name, cfg] of Object.entries(config)) {
      this.agents.set(name, { name, config: cfg, source: 'json' });
    }
  }

  loadFromDirectory(dir: string): void {
    if (!existsSync(dir)) return;
    const files = readdirSync(dir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const filePath = join(dir, file);
      const content = readFileSync(filePath, 'utf-8');
      const agent = this.parseMarkdownAgent(filePath, content);
      if (agent) {
        this.agents.set(agent.name, agent);
      }
    }
  }

  private parseMarkdownAgent(filePath: string, content: string): Agent | undefined {
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    if (!frontmatterMatch) return undefined;

    const rawYaml = frontmatterMatch[1]!;
    const body = frontmatterMatch[2]!.trim();
    const config: AgentConfig = { prompt: body };

    const lines = rawYaml.split('\n');
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();

      switch (key) {
        case 'description':
          config.description = stripQuotes(value);
          break;
        case 'mode':
          if (value === 'primary' || value === 'subagent') {
            config.mode = value;
          }
          break;
        case 'model':
          config.model = stripQuotes(value);
          break;
        case 'temperature':
          config.temperature = parseFloat(value);
          break;
        case 'topP':
          config.topP = parseFloat(value);
          break;
        case 'steps':
          config.steps = parseInt(value, 10);
          break;
        case 'disable':
          config.disable = value === 'true';
          break;
        case 'hidden':
          config.hidden = value === 'true';
          break;
        case 'color':
          config.color = stripQuotes(value);
          break;
        default:
          config[key] = parseYamlValue(value);
      }
    }

    const baseName = filePath.replace(/\.md$/, '').split('/').pop() || filePath;
    return { name: baseName, config, source: 'markdown', filePath };
  }

  scanDirectories(): void {
    const dirs: string[] = [];

    const globalDir = join(homedir(), '.config', 'sentinel', 'agents');
    if (existsSync(globalDir)) dirs.push(globalDir);

    const projectDir = join(this.projectRoot, '.opencode', 'agents');
    if (existsSync(projectDir)) dirs.push(projectDir);

    const compatDir = join(this.projectRoot, '.agents');
    if (existsSync(compatDir)) dirs.push(compatDir);

    for (const dir of dirs) {
      this.loadFromDirectory(dir);
    }
  }

  getAgent(name: string): Agent | undefined {
    return this.agents.get(name);
  }

  listAgents(mode?: AgentMode): Agent[] {
    const all = Array.from(this.agents.values());
    if (!mode || mode === 'all') return all;
    return all.filter(a => a.config.mode === mode);
  }

  getPrimaryAgents(): Agent[] {
    return this.listAgents('primary');
  }

  getSubAgents(): Agent[] {
    return this.listAgents('subagent');
  }

  resolveAgent(name: string): Agent {
    return this.agents.get(name) ?? this.getDefaultAgent();
  }

  getDefaultAgent(): Agent {
    const fallback = this.agents.get(this.defaultAgentName);
    if (fallback) return fallback;
    this.loadBuiltinAgents();
    return this.agents.get('build')!;
  }
}

function stripQuotes(s: string): string {
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseYamlValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const num = Number(value);
  if (!Number.isNaN(num)) return num;
  return stripQuotes(value);
}
