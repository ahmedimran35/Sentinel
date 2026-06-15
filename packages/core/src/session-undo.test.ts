import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionUndoManager } from './session-undo.js';
import { ShadowGit } from './commands/shadow-git.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('SessionUndoManager', () => {
  let tmpDir: string;
  let undoMgr: SessionUndoManager;
  let git: ShadowGit;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sess-undo-test-'));
    git = new ShadowGit(tmpDir);
    undoMgr = new SessionUndoManager(git);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('beforeTurn records entry and enables canUndo', async () => {
    const ref = await undoMgr.beforeTurn('sess-1', 0);
    expect(ref).toBeTruthy();
    expect(typeof ref).toBe('string');
    expect(undoMgr.canUndo('sess-1')).toBe(true);
    expect(undoMgr.canRedo('sess-1')).toBe(false);
  });

  it('canUndo returns false for unknown session', () => {
    expect(undoMgr.canUndo('unknown')).toBe(false);
  });

  it('canRedo returns false for unknown session', () => {
    expect(undoMgr.canRedo('unknown')).toBe(false);
  });

  it('undo returns entry and enables redo', async () => {
    await undoMgr.beforeTurn('sess-1', 0);
    await undoMgr.beforeTurn('sess-1', 1);
    const result = await undoMgr.undo('sess-1');
    expect(result).toBeDefined();
    expect(result!.message).toBe('Turn 1');
    expect(result!.gitRef).toBeTruthy();
    expect(undoMgr.canUndo('sess-1')).toBe(true);
    expect(undoMgr.canRedo('sess-1')).toBe(true);
  });

  it('undo returns null when no entries', async () => {
    const result = await undoMgr.undo('sess-1');
    expect(result).toBeNull();
  });

  it('redo restores undo state', async () => {
    await undoMgr.beforeTurn('sess-1', 0);
    await undoMgr.undo('sess-1');
    const result = await undoMgr.redo('sess-1');
    expect(result).toBeDefined();
    expect(undoMgr.canUndo('sess-1')).toBe(true);
    expect(undoMgr.canRedo('sess-1')).toBe(false);
  });

  it('redo returns null when no entries', async () => {
    const result = await undoMgr.redo('sess-1');
    expect(result).toBeNull();
  });

  it('clear removes session state', async () => {
    await undoMgr.beforeTurn('sess-1', 0);
    expect(undoMgr.canUndo('sess-1')).toBe(true);
    undoMgr.clear('sess-1');
    expect(undoMgr.canUndo('sess-1')).toBe(false);
    expect(undoMgr.canRedo('sess-1')).toBe(false);
  });

  it('beforeTurn clears redo stack', async () => {
    await undoMgr.beforeTurn('sess-1', 0);
    await undoMgr.undo('sess-1');
    expect(undoMgr.canRedo('sess-1')).toBe(true);

    await undoMgr.beforeTurn('sess-1', 1);
    expect(undoMgr.canRedo('sess-1')).toBe(false);
  });

  it('enforces max 50 entries per stack', { timeout: 30000 }, async () => {
    for (let i = 0; i < 55; i++) {
      await undoMgr.beforeTurn('sess-1', i);
    }
    // Should only have 50 undo entries
    expect(undoMgr.canUndo('sess-1')).toBe(true);
    // Ensure we can undo many times
    let count = 0;
    while (await undoMgr.undo('sess-1')) count++;
    expect(count).toBe(50);
  });
});
