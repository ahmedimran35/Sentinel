import { createHash } from 'node:crypto';

export type ScanResult = 'clean' | 'suspicious' | 'malicious';

export interface ScanFinding {
  toolName: string;
  score: ScanResult;
  flags: string[];
}

const SENSITIVE_PATHS = [
  '~/.ssh', '.ssh', 'id_rsa', 'id_ed25519',
  '.env', '.env.local', '.env.production',
  'auth.json', 'credentials.json', 'credentials',
  'aws-credentials', 'config.json',
  '.gitconfig', '.npmrc', '.netrc',
  'known_hosts', 'authorized_keys',
];

const IMPERATIVE_PATTERNS = [
  /ignore\s+(previous|all|your|the)/i,
  /do\s+not\s+(tell|inform|notify|share|reveal)/i,
  /before\s+(using|doing|running|executing)\s+(any|every|each)/i,
  /always\s+include\s+(the\s+)?contents/i,
  /never\s+(let|allow|permit)\s+(the\s+)?(user|human)/i,
  /pretend|fabricate|hallucinate/i,
  /this\s+is\s+(very\s+)?important/i,
  /override\s+(all\s+)?(previous|instructions)/i,
];

const HIDDEN_TEXT_PATTERNS = [
  /[\u200B-\u200D\uFEFF]/,       // zero-width chars
  /[\u2060-\u2069]/,              // invisible Unicode
  /[A-Za-z0-9+/]{40,}={0,2}/,    // base64 blobs
  /<!--[\s\S]*?-->/,             // HTML comments
];

export class MCPScanner {
  private hashStore = new Map<string, string>();

  scanTool(
    name: string,
    description: string,
    inputSchema: Record<string, unknown> = {},
  ): ScanFinding {
    const flags: string[] = [];

    const desc = description || '';
    const fullText = desc + ' ' + JSON.stringify(inputSchema);

    for (const pattern of IMPERATIVE_PATTERNS) {
      if (pattern.test(desc)) {
        flags.push(`Imperative/agent-directed instruction: "${pattern.source}"`);
      }
    }

    for (const path of SENSITIVE_PATHS) {
      if (fullText.toLowerCase().includes(path.toLowerCase())) {
        flags.push(`References sensitive path: ${path}`);
      }
    }

    for (const pattern of HIDDEN_TEXT_PATTERNS) {
      if (pattern.test(fullText)) {
        flags.push(`Hidden text trick: ${pattern.source}`);
      }
    }

    const schemaStr = JSON.stringify(inputSchema);
    const credIndicators = ['apiKey', 'api_key', 'token', 'secret', 'key', 'credential', 'password', 'private_key'];
    for (const indicator of credIndicators) {
      if (schemaStr.toLowerCase().includes(indicator)) {
        const toolNameLower = name.toLowerCase();
        if (!toolNameLower.includes('auth') && !toolNameLower.includes('login') && !toolNameLower.includes('token')) {
          flags.push(`Schema anomaly: parameter requesting "${indicator}" in non-auth tool`);
          break;
        }
      }
    }

    // Cross-tool shadowing: description referencing another tool's behavior
    const toolRefs = ['like the', 'similar to', 'same as', 'instead of using', 'same functionality'];
    for (const ref of toolRefs) {
      if (desc.toLowerCase().includes(ref)) {
        flags.push(`Cross-tool reference: "${ref}" may indicate shadowing`);
        break;
      }
    }

    let score: ScanResult = 'clean';
    if (flags.length > 0) {
      const hasHighRisk = flags.some(
        (f) => f.includes('Hidden text') || f.includes('sensitive path') || f.includes('Imperative'),
      );
      score = hasHighRisk ? 'malicious' : 'suspicious';
    }

    return { toolName: name, score, flags };
  }

  scanTools(
    tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>,
  ): ScanFinding[] {
    return tools.map((t) => this.scanTool(t.name, t.description, t.inputSchema));
  }

  hashDescription(description: string): string {
    return createHash('sha256').update(description).digest('hex');
  }

  storeHash(name: string, description: string): void {
    this.hashStore.set(name, this.hashDescription(description));
  }

  detectRugPull(
    name: string,
    description: string,
  ): { changed: boolean; oldHash?: string; newHash: string } {
    const oldHash = this.hashStore.get(name);
    const newHash = this.hashDescription(description);

    if (!oldHash) {
      return { changed: false, newHash };
    }

    return { changed: oldHash !== newHash, oldHash, newHash };
  }
}
