export type AgentMode = 'primary' | 'subagent' | 'all';

export interface AgentConfig {
  description?: string;
  mode?: AgentMode;
  model?: string;
  prompt?: string;
  permission?: Record<string, unknown>;
  tools?: Record<string, boolean>;
  temperature?: number;
  topP?: number;
  steps?: number;
  disable?: boolean;
  hidden?: boolean;
  color?: string;
  [key: string]: unknown;
}

export interface Agent {
  name: string;
  config: AgentConfig;
  source: 'builtin' | 'json' | 'markdown';
  filePath?: string;
}
