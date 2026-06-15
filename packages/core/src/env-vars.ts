export interface EnvConfig {
  autoShare: boolean;
  config: string;
  configDir: string;
  configContent: string;
  tuiConfig: string;
  disableAutoupdate: boolean;
  disablePrune: boolean;
  disableTerminalTitle: boolean;
  permission: string;
  disableDefaultPlugins: boolean;
  disableLspDownload: boolean;
  enableExperimentalModels: boolean;
  disableAutocompact: boolean;
  disableClaudeCode: boolean;
  disableClaudeCodePrompt: boolean;
  disableClaudeCodeSkills: boolean;
  disableModelsFetch: boolean;
  disableMouse: boolean;
  fakeVcs: string;
  client: string;
  enableExa: boolean;
  serverPassword: string;
  serverUsername: string;
  modelsUrl: string;
  gitBashPath: string;
}

function envBool(key: string): boolean {
  const val = process.env[key];
  return val === '1' || val === 'true' || val === 'yes';
}

function envStr(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

export function loadEnvConfig(): EnvConfig {
  return {
    autoShare: envBool('OPENCODE_AUTO_SHARE'),
    config: envStr('OPENCODE_CONFIG'),
    configDir: envStr('OPENCODE_CONFIG_DIR'),
    configContent: envStr('OPENCODE_CONFIG_CONTENT'),
    tuiConfig: envStr('OPENCODE_TUI_CONFIG'),
    disableAutoupdate: envBool('OPENCODE_DISABLE_AUTOUPDATE'),
    disablePrune: envBool('OPENCODE_DISABLE_PRUNE'),
    disableTerminalTitle: envBool('OPENCODE_DISABLE_TERMINAL_TITLE'),
    permission: envStr('OPENCODE_PERMISSION'),
    disableDefaultPlugins: envBool('OPENCODE_DISABLE_DEFAULT_PLUGINS'),
    disableLspDownload: envBool('OPENCODE_DISABLE_LSP_DOWNLOAD'),
    enableExperimentalModels: envBool('OPENCODE_ENABLE_EXPERIMENTAL_MODELS'),
    disableAutocompact: envBool('OPENCODE_DISABLE_AUTOCOMPACT'),
    disableClaudeCode: envBool('OPENCODE_DISABLE_CLAUDE_CODE'),
    disableClaudeCodePrompt: envBool('OPENCODE_DISABLE_CLAUDE_CODE_PROMPT'),
    disableClaudeCodeSkills: envBool('OPENCODE_DISABLE_CLAUDE_CODE_SKILLS'),
    disableModelsFetch: envBool('OPENCODE_DISABLE_MODELS_FETCH'),
    disableMouse: envBool('OPENCODE_DISABLE_MOUSE'),
    fakeVcs: envStr('OPENCODE_FAKE_VCS'),
    client: envStr('OPENCODE_CLIENT'),
    enableExa: envBool('OPENCODE_ENABLE_EXA'),
    serverPassword: envStr('OPENCODE_SERVER_PASSWORD'),
    serverUsername: envStr('OPENCODE_SERVER_USERNAME'),
    modelsUrl: envStr('OPENCODE_MODELS_URL'),
    gitBashPath: envStr('OPENCODE_GIT_BASH_PATH'),
  };
}
