const MODIFIERS = ['ctrl', 'alt', 'shift', 'meta'] as const;
const LEADER_KEY = 'ctrl+x';
const LEADER_TIMEOUT_MS = 2000;

export interface Keybind {
  keys: string;
  description: string;
  action: string;
  category: string;
}

const DEFAULT_BINDINGS: Keybind[] = [
  // Session
  { keys: 'ctrl-c', description: 'Abort current operation', action: 'abort', category: 'session' },
  { keys: 'ctrl-d', description: 'Exit application', action: 'exit', category: 'session' },
  { keys: 'escape', description: 'Cancel / interrupt', action: 'cancel', category: 'session' },
  { keys: 'ctrl-l', description: 'Clear screen', action: 'clear', category: 'session' },
  { keys: 'ctrl-s', description: 'Save session', action: 'saveSession', category: 'session' },
  { keys: 'ctrl-o', description: 'Open file', action: 'openFile', category: 'session' },
  { keys: 'ctrl+r', description: 'Rename session', action: 'renameSession', category: 'session' },
  // Leader bindings
  { keys: 'ctrl+x n', description: 'New session', action: 'sessionNew', category: 'session' },
  { keys: 'ctrl+x l', description: 'List sessions', action: 'sessionList', category: 'session' },
  { keys: 'ctrl+x c', description: 'Compact session', action: 'sessionCompact', category: 'session' },
  { keys: 'ctrl+x x', description: 'Export session', action: 'sessionExport', category: 'session' },
  { keys: 'ctrl+x g', description: 'Session timeline', action: 'sessionTimeline', category: 'session' },
  { keys: 'ctrl+x down', description: 'First child session', action: 'sessionChildFirst', category: 'session' },
  { keys: 'right', description: 'Next child session', action: 'sessionChildNext', category: 'session' },
  { keys: 'left', description: 'Previous child session', action: 'sessionChildPrev', category: 'session' },
  { keys: 'up', description: 'Parent session', action: 'sessionParent', category: 'session' },
  // Agent
  { keys: 'ctrl+x a', description: 'List agents', action: 'agentList', category: 'agent' },
  { keys: 'tab', description: 'Autocomplete / cycle agents', action: 'complete', category: 'editing' },
  { keys: 'shift+tab', description: 'Cycle agents reverse', action: 'agentCycleReverse', category: 'agent' },
  // Model
  { keys: 'ctrl+x m', description: 'List models', action: 'modelList', category: 'model' },
  { keys: 'f2', description: 'Cycle recent models', action: 'modelCycleRecent', category: 'model' },
  { keys: 'shift+f2', description: 'Cycle recent models reverse', action: 'modelCycleRecentReverse', category: 'model' },
  { keys: 'ctrl+t', description: 'Cycle variant', action: 'variantCycle', category: 'model' },
  // Navigation
  { keys: 'ctrl-p / up', description: 'Previous history entry', action: 'historyPrev', category: 'nav' },
  { keys: 'ctrl-n / down', description: 'Next history entry', action: 'historyNext', category: 'nav' },
  { keys: 'ctrl-f', description: 'Find in output', action: 'find', category: 'nav' },
  { keys: 'ctrl-g', description: 'Go to line', action: 'gotoLine', category: 'nav' },
  { keys: 'pageup', description: 'Page up messages', action: 'messagesPageUp', category: 'nav' },
  { keys: 'pagedown', description: 'Page down messages', action: 'messagesPageDown', category: 'nav' },
  { keys: 'home', description: 'First message', action: 'messagesFirst', category: 'nav' },
  { keys: 'end', description: 'Last message', action: 'messagesLast', category: 'nav' },
  { keys: 'ctrl+x y', description: 'Copy message', action: 'messagesCopy', category: 'nav' },
  // Editing
  { keys: 'ctrl-a / home', description: 'Go to start of line', action: 'lineStart', category: 'editing' },
  { keys: 'ctrl-e / end', description: 'Go to end of line', action: 'lineEnd', category: 'editing' },
  { keys: 'ctrl-w', description: 'Delete word backward', action: 'deleteWord', category: 'editing' },
  { keys: 'ctrl-u', description: 'Delete entire line', action: 'deleteLine', category: 'editing' },
  { keys: 'ctrl-k', description: 'Delete to end of line', action: 'deleteToEnd', category: 'editing' },
  { keys: 'ctrl-b', description: 'Move cursor left', action: 'cursorLeft', category: 'editing' },
  { keys: 'alt-b', description: 'Move word left', action: 'cursorWordLeft', category: 'editing' },
  { keys: 'alt-f', description: 'Move word right', action: 'cursorWordRight', category: 'editing' },
  { keys: 'alt-d', description: 'Delete word forward', action: 'deleteWordForward', category: 'editing' },
  { keys: 'ctrl-t', description: 'Transpose characters', action: 'transposeChars', category: 'editing' },
  // View
  { keys: 'ctrl-\\', description: 'Toggle sidebar', action: 'toggleSidebar', category: 'view' },
  { keys: 'ctrl-+ / ctrl-=', description: 'Zoom in', action: 'zoomIn', category: 'view' },
  { keys: 'ctrl--', description: 'Zoom out', action: 'zoomOut', category: 'view' },
  { keys: 'ctrl-0', description: 'Reset zoom', action: 'resetZoom', category: 'view' },
  { keys: 'ctrl-t', description: 'Toggle theme', action: 'toggleTheme', category: 'view' },
  { keys: 'ctrl-b', description: 'Toggle sidebar', action: 'toggleSidebar', category: 'view' },
  { keys: 'ctrl-v', description: 'Cycle variant', action: 'cycleVariant', category: 'view' },
  { keys: 'ctrl-space', description: 'Toggle thinking mode', action: 'toggleThinking', category: 'view' },
  // Dialog
  { keys: 'space', description: 'Toggle MCP in dialog', action: 'dialogMcpToggle', category: 'dialog' },
  { keys: 'ctrl-space', description: 'Toggle thinking', action: 'toggleThinking', category: 'view' },
  // Permission settings
  { keys: 'ctrl+shift+p', description: 'Open per-tool permission settings', action: 'permissionSettings', category: 'config' },
];

function parseKeyCombo(combo: string): { modifiers: string[]; key: string } {
  const modifiers: string[] = [];
  let rest = combo.toLowerCase().trim();
  let found = true;
  while (found) {
    found = false;
    for (const mod of MODIFIERS) {
      if (rest === mod) break;
      if (rest.startsWith(mod) && (rest[mod.length] === '-' || rest[mod.length] === '+')) {
        modifiers.push(mod);
        rest = rest.slice(mod.length + 1);
        found = true;
        break;
      }
    }
  }
  return { modifiers, key: rest };
}

function normalizeCombo(combo: string): string {
  const { modifiers, key } = parseKeyCombo(combo);
  const sorted = MODIFIERS.filter(m => modifiers.includes(m));
  return [...sorted, key].join('+');
}

function splitKeys(keys: string): string[] {
  return keys.split('/').map(k => k.trim());
}

export class Keybinds {
  private defaults: Map<string, KeybindInternal>;
  private bindings: Map<string, KeybindInternal>;
  private reverse: Map<string, string>;
  private listeners: Set<() => void>;
  private leaderActive = false;
  private leaderTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(overrides?: Partial<Keybind>[]) {
    this.defaults = new Map();
    this.bindings = new Map();
    this.reverse = new Map();
    this.listeners = new Set();
    this.loadDefaults();
    if (overrides) {
      for (const override of overrides) {
        if (override.action) {
          this.register(override.action, override.keys ?? '', override.description, override.category);
        }
      }
    }
    this.rebuildReverse();
  }

  private loadDefaults(): void {
    for (const kb of DEFAULT_BINDINGS) {
      const existing = this.defaults.get(kb.action);
      if (existing) {
        existing.displayKeys = existing.displayKeys + ' / ' + kb.keys;
        existing.keys.push(...splitKeys(kb.keys).map(normalizeCombo));
      } else {
        this.defaults.set(kb.action, {
          displayKeys: kb.keys,
          keys: splitKeys(kb.keys).map(normalizeCombo),
          description: kb.description,
          category: kb.category,
        });
      }
    }
    for (const [action, kb] of this.defaults) {
      const existing = this.bindings.get(action);
      if (existing) {
        existing.displayKeys = kb.displayKeys;
        existing.keys = [...kb.keys];
        existing.description = kb.description;
        existing.category = kb.category;
      } else {
        this.bindings.set(action, { ...kb, keys: [...kb.keys] });
      }
    }
  }

  get(action: string): string[] {
    const kb = this.bindings.get(action);
    return kb ? [...kb.keys] : [];
  }

  getAction(keyCombo: string): string | null {
    const normalized = normalizeCombo(keyCombo);

    // Leader key handling
    if (normalized === LEADER_KEY) {
      this.leaderActive = true;
      if (this.leaderTimer) clearTimeout(this.leaderTimer);
      this.leaderTimer = setTimeout(() => { this.leaderActive = false; }, LEADER_TIMEOUT_MS);
      return 'leader';
    }

    // If leader is active, treat this as a chorded key
    if (this.leaderActive) {
      this.leaderActive = false;
      if (this.leaderTimer) clearTimeout(this.leaderTimer);
      const chorded = normalizeCombo(`${LEADER_KEY}+${keyCombo}`);
      return this.reverse.get(chorded) ?? null;
    }

    return this.reverse.get(normalized) ?? null;
  }

  register(action: string, keys: string, description?: string, category?: string): void {
    const parsedKeys = splitKeys(keys).map(normalizeCombo);
    const existing = this.bindings.get(action);
    if (parsedKeys.length > 0 && parsedKeys[0] !== '') {
      if (existing) {
        existing.keys = parsedKeys;
        if (description !== undefined) existing.description = description;
        if (category !== undefined) existing.category = category;
        existing.displayKeys = keys;
      } else {
        this.bindings.set(action, {
          displayKeys: keys,
          keys: parsedKeys,
          description: description ?? '',
          category: category ?? 'custom',
        });
      }
    } else if (existing && (description !== undefined || category !== undefined)) {
      if (description !== undefined) existing.description = description;
      if (category !== undefined) existing.category = category;
    }
    this.rebuildReverse();
    this.emitChange();
  }

  getDescription(action: string): string | undefined {
    return this.bindings.get(action)?.description;
  }

  getCategory(action: string): string | undefined {
    return this.bindings.get(action)?.category;
  }

  isLeaderActive(): boolean {
    return this.leaderActive;
  }

  reset(): void {
    this.bindings.clear();
    for (const [action, kb] of this.defaults) {
      this.bindings.set(action, { ...kb, keys: [...kb.keys] });
    }
    this.rebuildReverse();
    this.emitChange();
  }

  toJSON(): Keybind[] {
    const result: Keybind[] = [];
    for (const [action, kb] of this.bindings) {
      result.push({
        keys: kb.displayKeys,
        description: kb.description,
        action,
        category: kb.category,
      });
    }
    return result.sort((a, b) => a.category.localeCompare(b.category) || a.action.localeCompare(b.action));
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private rebuildReverse(): void {
    this.reverse.clear();
    for (const [action, kb] of this.bindings) {
      for (const key of kb.keys) {
        this.reverse.set(key, action);
      }
    }
  }

  private emitChange(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

interface KeybindInternal {
  displayKeys: string;
  keys: string[];
  description: string;
  category: string;
}
