import { ShadowGit } from './commands/shadow-git.js';

export interface UndoEntry {
  messageIndex: number;
  gitRef: string;
  timestamp: Date;
  description: string;
}

interface SessionStack {
  undo: UndoEntry[];
  redo: UndoEntry[];
}

const MAX_ENTRIES = 50;

export class SessionUndoManager {
  private stacks = new Map<string, SessionStack>();
  private git: ShadowGit;

  constructor(git: ShadowGit) {
    this.git = git;
  }

  async beforeTurn(sessionId: string, messageIndex: number): Promise<string> {
    const stack = this.ensureStack(sessionId);
    const marker = {
      sessionId,
      messageIndex,
      timestamp: Date.now(),
    };
    const gitRef = await this.git.snapshot([
      { path: '.sentinel/undo-state.json', content: JSON.stringify(marker) },
    ]);
    const entry: UndoEntry = {
      messageIndex,
      gitRef,
      timestamp: new Date(),
      description: `Turn ${messageIndex}`,
    };
    stack.undo.push(entry);
    if (stack.undo.length > MAX_ENTRIES) {
      stack.undo.shift();
    }
    stack.redo = [];
    return gitRef;
  }

  async undo(sessionId: string): Promise<{ message: string; gitRef: string } | null> {
    const stack = this.stacks.get(sessionId);
    if (!stack || stack.undo.length === 0) return null;

    const entry = stack.undo.pop()!;
    stack.redo.push(entry);
    if (stack.redo.length > MAX_ENTRIES) {
      stack.redo.shift();
    }

    const files = await this.git.undo();
    if (!files) return null;

    return {
      message: entry.description,
      gitRef: entry.gitRef,
    };
  }

  async redo(sessionId: string): Promise<{ message: string; gitRef: string } | null> {
    const stack = this.stacks.get(sessionId);
    if (!stack || stack.redo.length === 0) return null;

    const entry = stack.redo.pop()!;
    stack.undo.push(entry);

    const files = await this.git.redo();
    if (!files) return null;

    return {
      message: entry.description,
      gitRef: entry.gitRef,
    };
  }

  canUndo(sessionId: string): boolean {
    const stack = this.stacks.get(sessionId);
    return !!stack && stack.undo.length > 0;
  }

  canRedo(sessionId: string): boolean {
    const stack = this.stacks.get(sessionId);
    return !!stack && stack.redo.length > 0;
  }

  clear(sessionId: string): void {
    this.stacks.delete(sessionId);
  }

  private ensureStack(sessionId: string): SessionStack {
    let stack = this.stacks.get(sessionId);
    if (!stack) {
      stack = { undo: [], redo: [] };
      this.stacks.set(sessionId, stack);
    }
    return stack;
  }
}
