export interface AnalysisResult {
  safe: boolean;
  flags: string[];
  risk: 'low' | 'medium' | 'high';
}

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; flag: string; risk: 'medium' | 'high' }> = [
  { pattern: /\brm\s+-rf\b/, flag: 'recursive force delete (rm -rf)', risk: 'high' },
  { pattern: /\brm\s+-r\b/, flag: 'recursive delete (rm -r)', risk: 'high' },
  { pattern: /\brm\s+-f\b/, flag: 'force delete (rm -f)', risk: 'high' },
  { pattern: /\bgit\s+push\s+--force\b/, flag: 'force push to git', risk: 'high' },
  { pattern: /\bsudo\b/, flag: 'sudo command', risk: 'high' },
  { pattern: /\bcurl\b.*\|\s*(?:bash|sh|zsh)\b/, flag: 'curl pipe to shell', risk: 'high' },
  { pattern: /\bwget\b.*\|\s*(?:bash|sh|zsh)\b/, flag: 'wget pipe to shell', risk: 'high' },
  { pattern: /\b(?:bash|sh|zsh)\s*[<>]/, flag: 'shell with redirect from paste', risk: 'high' },
  { pattern: /\bchmod\s+777\b/, flag: 'chmod 777 (world-writable)', risk: 'medium' },
  { pattern: /\bchown\b/, flag: 'chown command', risk: 'medium' },
  { pattern: /\bmkfs\./, flag: 'filesystem creation', risk: 'high' },
  { pattern: /\bdd\s+if=/, flag: 'dd raw device write', risk: 'high' },
  { pattern: /\b>:?\s*\/dev\//, flag: 'write to device file', risk: 'high' },
  { pattern: /\bnpm\s+install\s+-g\b/, flag: 'global npm install', risk: 'medium' },
  { pattern: /\bpnpm\s+add\s+-g\b/, flag: 'global pnpm install', risk: 'medium' },
  { pattern: /\byarn\s+global\s+add\b/, flag: 'global yarn install', risk: 'medium' },
  { pattern: /\bshutdown\b/, flag: 'system shutdown', risk: 'high' },
  { pattern: /\breboot\b/, flag: 'system reboot', risk: 'high' },
  { pattern: /\bpoweroff\b/, flag: 'system poweroff', risk: 'high' },
  { pattern: /\binit\s+0\b/, flag: 'system halt (init 0)', risk: 'high' },
  { pattern: /\binit\s+6\b/, flag: 'system reboot (init 6)', risk: 'high' },
];

export function analyzeBashCommand(command: string): AnalysisResult {
  const flags: string[] = [];
  let maxRisk: 'low' | 'medium' | 'high' = 'low';

  for (const { pattern, flag, risk } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      flags.push(flag);
      if (risk === 'high') maxRisk = 'high';
      else if (risk === 'medium' && maxRisk !== 'high') maxRisk = 'medium';
    }
  }

  if (command.includes('$(') || command.includes('`')) {
    flags.push('command substitution');
    if (maxRisk === 'low') maxRisk = 'medium';
  }

  return { safe: flags.length === 0, flags, risk: maxRisk };
}
