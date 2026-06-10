export interface RedactResult {
  text: string;
  redacted: number;
}

const PATTERNS: Array<{ name: string; regex: RegExp; replacement: string }> = [
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g, replacement: 'AKIA_REDACTED' },
  { name: 'AWS Secret Key', regex: /aws(.{0,20})?['"]?[0-9a-zA-Z/+]{40}['"]?/gi, replacement: 'AWS_SECRET_REDACTED' },
  { name: 'GitHub Token', regex: /gh[ps]_[0-9a-zA-Z]{36}/g, replacement: 'GH_TOKEN_REDACTED' },
  { name: 'OpenAI Key', regex: /sk-[0-9a-zA-Z]{32,}/g, replacement: 'SK_REDACTED' },
  { name: 'Anthropic Key', regex: /sk-ant-[0-9a-zA-Z]{32,}/g, replacement: 'ANTHROPIC_KEY_REDACTED' },
  { name: 'NVIDIA NIM Key', regex: /nvapi-[0-9a-zA-Z-]{32,}/g, replacement: 'NVAPI_REDACTED' },
  { name: 'JWT', regex: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, replacement: 'JWT_REDACTED' },
  { name: 'Generic Bearer Token', regex: /bearer\s+[0-9a-zA-Z\-_.]{20,}/gi, replacement: 'BEARER_REDACTED' },
  { name: 'Private Key', regex: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g, replacement: '-----BEGIN REDACTED PRIVATE KEY-----' },
  { name: 'NPM Token', regex: /npm_[0-9a-zA-Z]{36}/g, replacement: 'NPM_TOKEN_REDACTED' },
];

export function redactSecrets(text: string): RedactResult {
  let redacted = 0;
  let result = text;

  for (const { regex, replacement } of PATTERNS) {
    const matches = result.match(regex);
    if (matches) {
      redacted += matches.length;
      result = result.replace(regex, replacement);
    }
  }

  return { text: result, redacted };
}
