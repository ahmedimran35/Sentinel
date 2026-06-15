import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

export interface SessionTreeNode {
  id: string;
  parentId?: string;
  childIds: string[];
  title?: string;
  createdAt: Date;
  messageCount: number;
  forkPoint?: { messageId: string; messageIndex: number };
}

function treePath(): string {
  const dir = join(os.homedir(), '.config', 'sentinel');
  return join(dir, 'session-tree.json');
}

function ensureDir(): void {
  const dir = join(os.homedir(), '.config', 'sentinel');
  mkdirSync(dir, { recursive: true });
}

export class SessionTreeManager {
  private tree: Map<string, SessionTreeNode> = new Map();

  constructor() {
    this.load();
  }

  private load(): void {
    const file = treePath();
    if (!existsSync(file)) return;
    try {
      const raw = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>[];
      for (const item of raw) {
        const node: SessionTreeNode = {
          ...item,
          createdAt: new Date((item.createdAt as string)),
        } as SessionTreeNode;
        this.tree.set(node.id, node);
      }
    } catch {
      // corrupt file — start fresh
    }
  }

  private persist(): void {
    ensureDir();
    const data = Array.from(this.tree.values()).map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
    }));
    writeFileSync(treePath(), JSON.stringify(data, null, 2), 'utf-8');
  }

  createSession(parentId?: string, title?: string): SessionTreeNode {
    const id = crypto.randomUUID();
    const node: SessionTreeNode = {
      id,
      childIds: [],
      createdAt: new Date(),
      messageCount: 0,
      ...(parentId ? { parentId } : {}),
      ...(title ? { title } : {}),
    };
    this.tree.set(id, node);

    if (parentId) {
      const parent = this.tree.get(parentId);
      if (parent) {
        parent.childIds.push(id);
      }
    }

    this.persist();
    return node;
  }

  forkSession(sessionId: string, messageId: string): SessionTreeNode {
    const source = this.tree.get(sessionId);
    if (!source) throw new Error(`Session not found: ${sessionId}`);

    const msgIndex = source.forkPoint
      ? source.forkPoint.messageIndex
      : source.messageCount - 1;

    const child = this.createSession(sessionId, source.title ? `${source.title} (fork)` : undefined);
    child.forkPoint = { messageId, messageIndex: msgIndex };
    child.messageCount = msgIndex + 1;
    this.tree.set(child.id, child);
    this.persist();
    return child;
  }

  getSession(id: string): SessionTreeNode | undefined {
    return this.tree.get(id);
  }

  getChildren(parentId: string): SessionTreeNode[] {
    const parent = this.tree.get(parentId);
    if (!parent) return [];
    return parent.childIds.map((id) => this.tree.get(id)).filter(Boolean) as SessionTreeNode[];
  }

  getParent(sessionId: string): SessionTreeNode | undefined {
    const node = this.tree.get(sessionId);
    if (!node?.parentId) return undefined;
    return this.tree.get(node.parentId);
  }

  getAncestors(sessionId: string): SessionTreeNode[] {
    const result: SessionTreeNode[] = [];
    let current = this.tree.get(sessionId);
    while (current?.parentId) {
      const parent = this.tree.get(current.parentId);
      if (parent) {
        result.unshift(parent);
        current = parent;
      } else {
        break;
      }
    }
    return result;
  }

  getDescendants(sessionId: string): SessionTreeNode[] {
    const result: SessionTreeNode[] = [];
    const stack = [sessionId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      const node = this.tree.get(id);
      if (!node) continue;
      for (const childId of node.childIds) {
        const child = this.tree.get(childId);
        if (child) {
          result.push(child);
          stack.push(childId);
        }
      }
    }
    return result;
  }

  deleteBranch(sessionId: string): void {
    const descendants = this.getDescendants(sessionId);
    const ids = [sessionId, ...descendants.map((d) => d.id)];

    const node = this.tree.get(sessionId);
    if (node?.parentId) {
      const parent = this.tree.get(node.parentId);
      if (parent) {
        parent.childIds = parent.childIds.filter((id) => id !== sessionId);
      }
    }

    for (const id of ids) {
      this.tree.delete(id);
    }
    this.persist();
  }

  setTitle(sessionId: string, title: string): void {
    const node = this.tree.get(sessionId);
    if (!node) throw new Error(`Session not found: ${sessionId}`);
    node.title = title;
    this.persist();
  }

  getRootSessions(): SessionTreeNode[] {
    return Array.from(this.tree.values()).filter((n) => !n.parentId);
  }
}
