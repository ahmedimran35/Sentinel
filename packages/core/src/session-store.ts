import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Session, Config } from './commands/types.js';

export interface SavedSession {
  id: string;
  startTime: string;
  endTime: string;
  tokenCounts: Session['tokenCounts'];
  cost: number;
  model: string;
  mode: string;
  history: Session['history'];
}

function sessionDir(projectRoot: string): string {
  return resolve(projectRoot, '.sentinel', 'sessions');
}

export function saveSession(projectRoot: string, session: Session, config: Config): void {
  const dir = sessionDir(projectRoot);
  mkdirSync(dir, { recursive: true });
  const data: SavedSession = {
    id: session.id,
    startTime: session.startTime.toISOString(),
    endTime: new Date().toISOString(),
    tokenCounts: session.tokenCounts,
    cost: session.cost,
    model: config.model,
    mode: config.mode,
    history: session.history,
  };
  writeFileSync(resolve(dir, `${session.id}.json`), JSON.stringify(data, null, 2), 'utf-8');
}

export function loadSession(projectRoot: string, id: string): SavedSession | null {
  const file = resolve(sessionDir(projectRoot), `${id}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as SavedSession;
  } catch {
    return null;
  }
}

export function listSessions(projectRoot: string): SavedSession[] {
  const dir = sessionDir(projectRoot);
  if (!existsSync(dir)) return [];
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    const sessions: SavedSession[] = [];
    for (const f of files) {
      try {
        const data = JSON.parse(readFileSync(resolve(dir, f), 'utf-8')) as SavedSession;
        sessions.push(data);
      } catch {
        // skip corrupt
      }
    }
    return sessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  } catch {
    return [];
  }
}

export function removeSession(projectRoot: string, id: string): boolean {
  const file = resolve(sessionDir(projectRoot), `${id}.json`);
  if (!existsSync(file)) return false;
  unlinkSync(file);
  return true;
}

export function findLastSession(projectRoot: string): SavedSession | null {
  const sessions = listSessions(projectRoot);
  return sessions[0] ?? null;
}
