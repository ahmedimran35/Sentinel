import { describe, it, expect } from 'vitest';
import { Keybinds } from './keybinds.js';

describe('Keybinds', () => {
  describe('default keybinds', () => {
    const kb = new Keybinds();

    it('should resolve abort to ctrl+c', () => {
      expect(kb.get('abort')).toContain('ctrl+c');
    });

    it('should resolve exit to ctrl+d', () => {
      expect(kb.get('exit')).toContain('ctrl+d');
    });

    it('should resolve cancel to escape', () => {
      expect(kb.get('cancel')).toContain('escape');
    });

    it('should resolve clear to ctrl+l', () => {
      expect(kb.get('clear')).toContain('ctrl+l');
    });

    it('should resolve historyPrev to ctrl+p and up', () => {
      const keys = kb.get('historyPrev');
      expect(keys).toContain('ctrl+p');
      expect(keys).toContain('up');
      expect(keys).toHaveLength(2);
    });

    it('should resolve historyNext to ctrl+n and down', () => {
      const keys = kb.get('historyNext');
      expect(keys).toContain('ctrl+n');
      expect(keys).toContain('down');
      expect(keys).toHaveLength(2);
    });

    it('should resolve lineStart to ctrl+a and home', () => {
      const keys = kb.get('lineStart');
      expect(keys).toContain('ctrl+a');
      expect(keys).toContain('home');
    });

    it('should resolve lineEnd to ctrl+e and end', () => {
      expect(kb.get('lineEnd')).toContain('ctrl+e');
      expect(kb.get('lineEnd')).toContain('end');
    });

    it('should resolve zoomIn to ctrl++ and ctrl+=', () => {
      const keys = kb.get('zoomIn');
      expect(keys).toContain('ctrl++');
      expect(keys).toContain('ctrl+=');
      expect(keys).toHaveLength(2);
    });

    it('should resolve zoomOut to ctrl+-', () => {
      expect(kb.get('zoomOut')).toContain('ctrl+-');
    });

    it('should resolve resetZoom to ctrl+0', () => {
      expect(kb.get('resetZoom')).toContain('ctrl+0');
    });

    it('should resolve toggleSidebar to ctrl+\\ and ctrl+b', () => {
      const keys = kb.get('toggleSidebar');
      expect(keys).toContain('ctrl+\\');
      expect(keys).toContain('ctrl+b');
    });

    it('should resolve complete to tab', () => {
      expect(kb.get('complete')).toContain('tab');
    });

    it('should resolve toggleThinking to ctrl+space', () => {
      expect(kb.get('toggleThinking')).toContain('ctrl+space');
    });

    it('should return empty array for unknown action', () => {
      expect(kb.get('unknownAction')).toEqual([]);
    });
  });

  describe('reverse lookup', () => {
    const kb = new Keybinds();

    it('should find action from ctrl+c', () => {
      expect(kb.getAction('ctrl+c')).toBe('abort');
    });

    it('should find action from up', () => {
      expect(kb.getAction('up')).toBe('historyPrev');
    });

    it('should find action from ctrl+b', () => {
      expect(kb.getAction('ctrl+b')).toBe('toggleSidebar');
    });

    it('should find action from ctrl+\\', () => {
      expect(kb.getAction('ctrl+\\')).toBe('toggleSidebar');
    });

    it('should find action from ctrl+space', () => {
      expect(kb.getAction('ctrl+space')).toBe('toggleThinking');
    });

    it('should return null for unknown combo', () => {
      expect(kb.getAction('ctrl+z')).toBeNull();
    });

    it('should normalize input before lookup (dash format)', () => {
      expect(kb.getAction('ctrl-c')).toBe('abort');
    });

    it('should normalize input before lookup (mixed case)', () => {
      expect(kb.getAction('Ctrl+C')).toBe('abort');
    });
  });

  describe('custom overrides', () => {
    it('should override existing keybind from config', () => {
      const kb = new Keybinds([{ action: 'abort', keys: 'ctrl-x' }]);
      expect(kb.get('abort')).toContain('ctrl+x');
      expect(kb.get('abort')).not.toContain('ctrl+c');
    });

    it('should add new action from config', () => {
      const kb = new Keybinds([{ action: 'customAction', keys: 'ctrl-y', description: 'Custom', category: 'custom' }]);
      expect(kb.get('customAction')).toContain('ctrl+y');
      expect(kb.getAction('ctrl+y')).toBe('customAction');
    });

    it('should merge overrides with defaults', () => {
      const kb = new Keybinds([{ action: 'find', keys: 'ctrl-f' }]);
      expect(kb.get('exit')).toContain('ctrl+d');
      expect(kb.get('find')).toContain('ctrl+f');
    });

    it('should update description and category via override', () => {
      const kb = new Keybinds([{ action: 'exit', keys: 'ctrl-q', description: 'Quit', category: 'app' }]);
      expect(kb.get('exit')).toContain('ctrl+q');
    });
  });

  describe('register', () => {
    it('should add a new binding', () => {
      const kb = new Keybinds();
      kb.register('myAction', 'ctrl-m');
      expect(kb.get('myAction')).toContain('ctrl+m');
      expect(kb.getAction('ctrl+m')).toBe('myAction');
    });

    it('should override an existing binding', () => {
      const kb = new Keybinds();
      kb.register('abort', 'ctrl-x');
      expect(kb.get('abort')).toContain('ctrl+x');
      expect(kb.get('abort')).not.toContain('ctrl+c');
    });

    it('should handle multiple key combos', () => {
      const kb = new Keybinds();
      kb.register('multi', 'ctrl-x / ctrl-y');
      const keys = kb.get('multi');
      expect(keys).toContain('ctrl+x');
      expect(keys).toContain('ctrl+y');
      expect(keys).toHaveLength(2);
    });
  });

  describe('reset', () => {
    it('should restore default keybinds after override', () => {
      const kb = new Keybinds();
      kb.register('abort', 'ctrl-x');
      expect(kb.get('abort')).toContain('ctrl+x');
      kb.reset();
      expect(kb.get('abort')).toContain('ctrl+c');
      expect(kb.get('abort')).not.toContain('ctrl+x');
    });

    it('should remove custom actions added via register', () => {
      const kb = new Keybinds();
      kb.register('custom', 'ctrl-z');
      kb.reset();
      expect(kb.get('custom')).toEqual([]);
    });
  });

  describe('normalization', () => {
    const kb = new Keybinds();

    it('should normalize dash-separated combos', () => {
      expect(kb.getAction('ctrl-c')).toBe('abort');
    });

    it('should normalize plus-separated combos', () => {
      expect(kb.getAction('ctrl+c')).toBe('abort');
    });

    it('should be case-insensitive', () => {
      expect(kb.getAction('Ctrl+C')).toBe('abort');
      expect(kb.getAction('CTRL+C')).toBe('abort');
    });

    it('should sort modifiers consistently', () => {
      kb.register('testShift', 'shift-ctrl-a');
      const keys = kb.get('testShift');
      expect(keys).toContain('ctrl+shift+a');
    });

    it('should handle meta modifier', () => {
      kb.register('testMeta', 'meta-alt-x');
      const keys = kb.get('testMeta');
      expect(keys).toContain('alt+meta+x');
    });
  });

  describe('onChange', () => {
    it('should notify listeners when keybinds change', () => {
      const kb = new Keybinds();
      let called = 0;
      const unsub = kb.onChange(() => { called++; });
      kb.register('test', 'ctrl-t');
      expect(called).toBe(1);
      unsub();
      kb.register('test2', 'ctrl-u');
      expect(called).toBe(1);
    });
  });

  describe('toJSON', () => {
    it('should return all keybinds sorted by category then action', () => {
      const kb = new Keybinds();
      const json = kb.toJSON();
      expect(json.length).toBeGreaterThan(20);
      for (const entry of json) {
        expect(entry).toHaveProperty('keys');
        expect(entry).toHaveProperty('description');
        expect(entry).toHaveProperty('action');
        expect(entry).toHaveProperty('category');
      }
    });

    it('should include custom registered keybinds', () => {
      const kb = new Keybinds();
      kb.register('myAction', 'ctrl-z', 'My action', 'custom');
      const json = kb.toJSON();
      const found = json.find(k => k.action === 'myAction');
      expect(found).toBeDefined();
      expect(found!.keys).toBe('ctrl-z');
    });
  });

  describe('getDescription and getCategory', () => {
    it('should return description for known action', () => {
      const kb = new Keybinds();
      expect(kb.getDescription('abort')).toBe('Abort current operation');
    });

    it('should return undefined for unknown action', () => {
      const kb = new Keybinds();
      expect(kb.getDescription('nope')).toBeUndefined();
    });

    it('should return category for known action', () => {
      const kb = new Keybinds();
      expect(kb.getCategory('abort')).toBe('session');
    });
  });
});
