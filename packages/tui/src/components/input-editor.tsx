import { useState, useRef, useEffect, type FunctionComponent } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../theme-context.js';
import { FilePicker } from './file-picker.js';
import { AutocompleteEngine } from '../autocomplete.js';

interface CommandEntry {
  name: string;
  summary: string;
  usage: string;
  argHint?: string;
}

interface InputEditorProps {
  onSubmit: (value: string) => void;
  disabled?: boolean;
  commands?: CommandEntry[];
  fileResults?: string[];
  onFileSearch?: (query: string) => void;
  onFileSelect?: (path: string) => void;
  onFileCancel?: () => void;
  autocompleteEngine?: AutocompleteEngine;
}

function fuzzyMatch(query: string, text: string): boolean {
  const lower = query.toLowerCase();
  const target = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < target.length && qi < lower.length; ti++) {
    if (target[ti] === lower[qi]) qi++;
  }
  return qi === lower.length;
}

export const InputEditor: FunctionComponent<InputEditorProps> = ({
  onSubmit, disabled = false, commands,
  fileResults = [], onFileSearch, onFileSelect, onFileCancel,
  autocompleteEngine,
}) => {
  const theme = useTheme();
  const [value, setValue] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [ghostSuggestion, setGhostSuggestion] = useState<string | null>(null);
  const maxVisible = 12;
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);

  const showPalette = value.startsWith('/') && commands && commands.length > 0;
  const query = showPalette ? value.slice(1) : '';
  const atMatch = value.match(/(?:^|\s)@(\w*)$/);
  const showFilePicker = !!atMatch && (onFileSearch != null);

  const filtered = query
    ? (commands ?? []).filter((c) => fuzzyMatch(query, c.name) || fuzzyMatch(query, c.summary))
    : (commands ?? []);

  useEffect(() => {
    setSelectedIdx(0);
    setScrollOffset(0);
    navigatedRef.current = false;
  }, [query]);

  useEffect(() => {
    if (atMatch && onFileSearch) {
      onFileSearch(atMatch[1] ?? '');
    }
  }, [atMatch?.[0]]);

  useEffect(() => {
    if (!autocompleteEngine || !value || disabled || showFilePicker) {
      setGhostSuggestion(null);
      return;
    }
    const cursorPos = value.length;
    let cancelled = false;
    autocompleteEngine.suggest(value, cursorPos).then((suggestion) => {
      if (!cancelled) setGhostSuggestion(suggestion);
    });
    return () => { cancelled = true; };
  }, [value, disabled, showFilePicker, autocompleteEngine]);

  const acceptAutocomplete = useRef(() => {});
  acceptAutocomplete.current = () => {
    if (ghostSuggestion && autocompleteEngine) {
      const text = autocompleteEngine.accept();
      if (text) {
        setValue((prev) => prev + text);
      }
      setGhostSuggestion(null);
    }
  };

  useInput((_input, key) => {
    if (disabled) return;
    if (showFilePicker) {
      if (key.escape) {
        setValue((v) => v.replace(/@\w*$/, ''));
        onFileCancel?.();
        return;
      }
      return;
    }
    if (key.tab && ghostSuggestion) {
      acceptAutocomplete.current();
      return;
    }
    if (key.downArrow && showPalette) {
      navigatedRef.current = true;
      const maxIdx = Math.max(filtered.length - 1, 0);
      setSelectedIdx((prev) => {
        const next = Math.min(prev + 1, maxIdx);
        if (next >= scrollOffset + maxVisible) setScrollOffset(next - maxVisible + 1);
        return next;
      });
      return;
    }
    if (key.upArrow && showPalette) {
      navigatedRef.current = true;
      setSelectedIdx((prev) => {
        const next = Math.max(prev - 1, 0);
        if (next < scrollOffset) setScrollOffset(next);
        return next;
      });
      return;
    }
    if (key.escape) {
      if (ghostSuggestion) {
        autocompleteEngine?.reject();
        setGhostSuggestion(null);
      }
      if (showPalette) {
        setValue('');
        setSelectedIdx(0);
        setScrollOffset(0);
        navigatedRef.current = false;
      }
      return;
    }
    if (key.upArrow && !showPalette) {
      if (history.current.length > 0) {
        const idx = historyIndex.current < history.current.length - 1 ? historyIndex.current + 1 : historyIndex.current;
        historyIndex.current = idx;
        setValue(history.current[history.current.length - 1 - idx] ?? '');
      }
      return;
    }
    if (key.downArrow && !showPalette) {
      if (historyIndex.current > 0) {
        historyIndex.current--;
        setValue(history.current[history.current.length - 1 - historyIndex.current] ?? '');
      } else {
        historyIndex.current = -1;
        setValue('');
      }
      return;
    }
  });

  const navigatedRef = useRef(false);

  const handleSubmit = (v: string) => {
    // If user navigated the palette with arrows, submit the selected command
    if (showPalette && navigatedRef.current && filtered.length > 0) {
      const cmd = `/${filtered[selectedIdx]!.name}`;
      history.current.push(cmd);
      historyIndex.current = -1;
      onSubmit(cmd);
      setValue('');
      setSelectedIdx(0);
      setScrollOffset(0);
      navigatedRef.current = false;
      return;
    }
    // Otherwise submit raw input (preserves args, aliases, etc.)
    if (v.trim()) {
      history.current.push(v);
      historyIndex.current = -1;
      onSubmit(v);
      setValue('');
      setSelectedIdx(0);
      setScrollOffset(0);
    }
  };

  const handleFileSelect = (filePath: string) => {
    const idx = value.lastIndexOf('@');
    if (idx >= 0) {
      setValue(value.slice(0, idx) + filePath + ' ');
    }
    onFileSelect?.(filePath);
  };

  const handleFileCancel = () => {
    setValue((v) => v.replace(/@\w*$/, ''));
    onFileCancel?.();
  };

  return (
    <Box flexDirection="column" width="100%">
      {showFilePicker && (
        <FilePicker
          results={fileResults}
          onSelect={handleFileSelect}
          onCancel={handleFileCancel}
          onSearch={(q) => onFileSearch?.(q)}
        />
      )}
      {showPalette && (
        <Box flexDirection="column" borderStyle="round" borderColor={theme.brand} paddingX={1} width="100%">
          {filtered.length === 0 && (
            <Box><Text dimColor>No matching commands</Text></Box>
          )}
          {filtered.length > maxVisible && <Text dimColor>  {scrollOffset > 0 ? '↑ ' : ''}{scrollOffset + maxVisible < filtered.length ? '↓ ' : ''}{filtered.length} commands</Text>}
          {filtered.slice(scrollOffset, scrollOffset + maxVisible).map((cmd, i) => {
            const visualIdx = i + scrollOffset;
            return (
            <Box key={cmd.name}>
              <Text>
                {visualIdx === selectedIdx ? <Text color={theme.brand}>▸ </Text> : <Text>  </Text>}
                <Text bold color={visualIdx === selectedIdx ? theme.brand : undefined}>
                  /{cmd.name}
                </Text>
                {'  '}
                <Text dimColor>{cmd.summary}</Text>
                {cmd.argHint && <Text color={theme.dim}> {'<'}{cmd.argHint}{'>'}</Text>}
              </Text>
            </Box>
            );
          })}
        </Box>
      )}
      <Box borderStyle="single" borderColor={theme.border} width="100%">
        <Box flexGrow={1}>
          <Text bold color={theme.brand}> › </Text>
          {disabled ? (
            <Text dimColor>waiting for response…</Text>
          ) : (
            <>
              <TextInput
                value={value}
                onChange={setValue}
                onSubmit={handleSubmit}
                placeholder="type a message, @file to attach, /help for commands"
              />
              {ghostSuggestion && (
                <Text dimColor>{ghostSuggestion}</Text>
              )}
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
};
