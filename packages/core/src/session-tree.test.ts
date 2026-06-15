import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionTreeManager } from './session-tree.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('SessionTreeManager', () => {
  let manager: SessionTreeManager;

  beforeEach(() => {
    manager = new SessionTreeManager();
  });

  afterEach(() => {
    // Clean up the persisted file
    const home = os.homedir();
    const file = path.join(home, '.config', 'sentinel', 'session-tree.json');
    try { fs.unlinkSync(file); } catch { /* ignore */ }
  });

  it('creates a root session', () => {
    const s = manager.createSession();
    expect(s.id).toBeTruthy();
    expect(s.parentId).toBeUndefined();
    expect(s.childIds).toEqual([]);
    expect(s.createdAt).toBeInstanceOf(Date);
    expect(s.messageCount).toBe(0);
  });

  it('creates a session with parent', () => {
    const parent = manager.createSession();
    const child = manager.createSession(parent.id);
    expect(child.parentId).toBe(parent.id);

    const children = manager.getChildren(parent.id);
    expect(children).toHaveLength(1);
    expect(children[0]!.id).toBe(child.id);
  });

  it('creates a session with title', () => {
    const s = manager.createSession(undefined, 'My Session');
    expect(s.title).toBe('My Session');
  });

  it('forkSession creates child with forkPoint', () => {
    const parent = manager.createSession();
    parent.messageCount = 5;
    const forked = manager.forkSession(parent.id, 'msg-3');
    expect(forked.parentId).toBe(parent.id);
    expect(forked.forkPoint).toBeDefined();
    expect(forked.forkPoint!.messageId).toBe('msg-3');
    expect(forked.messageCount).toBe(5);
  });

  it('getSession returns undefined for missing', () => {
    expect(manager.getSession('nonexistent')).toBeUndefined();
  });

  it('getParent returns correct parent', () => {
    const parent = manager.createSession();
    const child = manager.createSession(parent.id);
    const found = manager.getParent(child.id);
    expect(found?.id).toBe(parent.id);
  });

  it('getAncestors returns full chain to root', () => {
    const root = manager.createSession();
    const child = manager.createSession(root.id);
    const grandchild = manager.createSession(child.id);
    const ancestors = manager.getAncestors(grandchild.id);
    expect(ancestors).toHaveLength(2);
    expect(ancestors[0]!.id).toBe(root.id);
    expect(ancestors[1]!.id).toBe(child.id);
  });

  it('getDescendants returns full subtree', () => {
    const root = manager.createSession();
    const child = manager.createSession(root.id);
    const grandchild = manager.createSession(child.id);
    const descendants = manager.getDescendants(root.id);
    expect(descendants).toHaveLength(2);
    expect(descendants.map((d) => d.id)).toContain(child.id);
    expect(descendants.map((d) => d.id)).toContain(grandchild.id);
  });

  it('deleteBranch removes session and all descendants', () => {
    const root = manager.createSession();
    const child = manager.createSession(root.id);
    const grandchild = manager.createSession(child.id);

    manager.deleteBranch(child.id);

    expect(manager.getSession(child.id)).toBeUndefined();
    expect(manager.getSession(grandchild.id)).toBeUndefined();
    expect(manager.getSession(root.id)).toBeDefined();
    expect(manager.getChildren(root.id)).toHaveLength(0);
  });

  it('setTitle updates session title', () => {
    const s = manager.createSession();
    manager.setTitle(s.id, 'Updated Title');
    expect(manager.getSession(s.id)!.title).toBe('Updated Title');
  });

  it('getRootSessions returns only root sessions', () => {
    const r1 = manager.createSession();
    const r2 = manager.createSession();
    const child = manager.createSession(r1.id);
    const roots = manager.getRootSessions();
    expect(roots).toHaveLength(2);
    expect(roots.map((r) => r.id)).toContain(r1.id);
    expect(roots.map((r) => r.id)).toContain(r2.id);
    expect(roots.map((r) => r.id)).not.toContain(child.id);
  });
});
