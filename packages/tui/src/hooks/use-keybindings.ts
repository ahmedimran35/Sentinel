import { useEffect } from 'react';

export interface KeyBinding {
  keys: string[];
  handler: () => void;
  description: string;
}

export interface KeybindingsConfig {
  bindings: KeyBinding[];
  onInput: ((ch: string) => void) | null;
  enabled: boolean;
}

export function useKeybindings({ bindings, onInput, enabled }: KeybindingsConfig): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKey = (ch: string, key: { name?: string; ctrl?: boolean; meta?: boolean }) => {
      if (onInput && ch && !key.ctrl && !key.meta) {
        onInput(ch);
        return;
      }

      for (const b of bindings) {
        const match = b.keys.some((k) => {
          if (k === 'ctrl+c' && key.ctrl && key.name === 'c') return true;
          if (k === 'ctrl+d' && key.ctrl && key.name === 'd') return true;
          if (k === 'escape' && key.name === 'escape') return true;
          if (k === 'tab' && key.name === 'tab') return true;
          return false;
        });
        if (match) {
          b.handler();
          return;
        }
      }
    };

    process.stdin.on('keypress', handleKey);
    return () => {
      process.stdin.off('keypress', handleKey);
    };
  }, [bindings, onInput, enabled]);
}
