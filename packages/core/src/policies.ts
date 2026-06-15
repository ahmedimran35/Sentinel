export interface PolicyStatement {
  effect: 'allow' | 'deny';
  action: 'provider.use' | 'tool.use' | 'bash.command' | 'network.access';
  resource: string;
}

export interface PolicyConfig {
  statements: PolicyStatement[];
}

export function evaluatePolicy(
  policies: PolicyConfig | undefined,
  action: PolicyStatement['action'],
  resource: string,
): 'allow' | 'deny' {
  if (!policies || !policies.statements || policies.statements.length === 0) {
    return 'allow';
  }

  let result: 'allow' | 'deny' = 'allow';

  for (const stmt of policies.statements) {
    if (stmt.action !== action) continue;
    if (!wildcardMatch(resource, stmt.resource)) continue;
    result = stmt.effect;
  }

  return result;
}

function wildcardMatch(value: string, pattern: string): boolean {
  const regexStr = '^' + pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.') + '$';
  return new RegExp(regexStr).test(value);
}
