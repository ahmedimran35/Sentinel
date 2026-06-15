import { createHash } from 'node:crypto';
import { loadSession, saveSession } from './session-store.js';
import type { SavedSession } from './session-store.js';
import type { Session, Config } from './commands/types.js';

interface ShareDocument {
  version: 1;
  createdAt: string;
  session: SavedSession;
}

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}

export class InvalidShareJsonError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'InvalidShareJsonError';
  }
}

function loadOrThrow(sessionId: string, projectRoot: string): SavedSession {
  const session = loadSession(projectRoot, sessionId);
  if (!session) throw new SessionNotFoundError(sessionId);
  return session;
}

function buildShareDoc(session: SavedSession): ShareDocument {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    session,
  };
}

function generateShareId(sessionId: string): string {
  const hash = createHash('sha256').update(`${sessionId}:${Date.now()}`).digest('hex');
  return hash.slice(0, 8);
}

export async function shareSession(
  sessionId: string,
  projectRoot: string,
): Promise<{ url: string; json: string }> {
  const session = loadOrThrow(sessionId, projectRoot);
  const doc = buildShareDoc(session);
  const json = JSON.stringify(doc, null, 2);

  const shareUrl = process.env.SENTINEL_SHARE_URL;
  if (shareUrl) {
    const res = await fetch(shareUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: json,
    });
    if (!res.ok) {
      throw new Error(`Share server responded ${res.status}: ${res.statusText}`);
    }
    const body = await res.json() as { url: string };
    return { url: body.url, json };
  }

  const shareId = generateShareId(sessionId);
  return { url: `sentinel://share/${shareId}`, json };
}

function roleBadge(role: string): string {
  const labels: Record<string, string> = {
    user: '👤 User',
    assistant: '🤖 Assistant',
    system: '⚙️ System',
    tool: '🔧 Tool',
  };
  return labels[role] ?? `❓ ${role}`;
}

function formatMessages(history: SavedSession['history']): string {
  const lines: string[] = [];
  for (const msg of history) {
    lines.push(`### ${roleBadge(msg.role)}`);
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        const raw = tc.function.arguments;
        let pretty = raw;
        try {
          pretty = JSON.stringify(JSON.parse(raw), null, 2);
        } catch { /* use raw */ }
        lines.push('');
        lines.push(`**Tool call:** \`${tc.function.name}\``);
        lines.push(`\`\`\`json\n${pretty}\n\`\`\``);
      }
    }
    if (msg.content) {
      lines.push('');
      lines.push(msg.content);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function exportSession(
  sessionId: string,
  projectRoot: string,
  format: 'json' | 'md' = 'json',
): string {

  const session = loadOrThrow(sessionId, projectRoot);

  if (format === 'md') {
    const lines: string[] = [];
    lines.push(`# Session: ${session.id}`);
    lines.push('');
    lines.push(`- **Date:** ${session.startTime}`);
    lines.push(`- **Model:** ${session.model}`);
    lines.push(`- **Mode:** ${session.mode}`);
    lines.push(`- **Tokens:** ${session.tokenCounts.input} in / ${session.tokenCounts.output} out / ${session.tokenCounts.cached} cached`);
    lines.push(`- **Cost:** $${session.cost.toFixed(4)}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(formatMessages(session.history));
    return lines.join('\n');
  }

  const doc = buildShareDoc(session);
  return JSON.stringify(doc, null, 2);
}

export function importSession(json: string, projectRoot: string): { id: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new InvalidShareJsonError('Invalid JSON');
  }

  const doc = parsed as Record<string, unknown>;

  if (doc.version !== 1) {
    throw new InvalidShareJsonError('Unsupported share version');
  }

  const s = doc.session as Record<string, unknown> | undefined;
  if (!s || typeof s.id !== 'string') {
    throw new InvalidShareJsonError('Missing or invalid session data');
  }

  const rawTokens = s.tokenCounts as Record<string, unknown> | undefined;

  const session: Session = {
    id: s.id as string,
    startTime: new Date((s.startTime as string) ?? Date.now()),
    history: Array.isArray(s.history) ? (s.history as Session['history']) : [],
    tokenCounts: {
      input: typeof rawTokens?.input === 'number' ? rawTokens.input : 0,
      output: typeof rawTokens?.output === 'number' ? rawTokens.output : 0,
      cached: typeof rawTokens?.cached === 'number' ? rawTokens.cached : 0,
    },
    cost: typeof s.cost === 'number' ? s.cost : 0,
  };

  const config: Config = {
    projectRoot,
    allowOutsideRoot: false,
    mode: typeof s.mode === 'string' ? s.mode : 'unknown',
    model: typeof s.model === 'string' ? s.model : 'unknown',
  };

  saveSession(projectRoot, session, config);
  return { id: session.id };
}
