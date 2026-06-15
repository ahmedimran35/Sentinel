import { useState, useEffect, type FunctionComponent } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../theme-context.js';

interface CommandEntry {
  name: string;
  summary: string;
  usage: string;
  argHint?: string;
}

interface CommandPaletteProps {
  commands: CommandEntry[];
  onSelect: (commandKey: string) => void;
  onCancel: () => void;
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

export const CommandPalette: FunctionComponent<CommandPaletteProps> = ({ commands, onSelect, onCancel }) => {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  const filtered = query
    ? commands.filter((c) => fuzzyMatch(query, c.name) || fuzzyMatch(query, c.summary))
    : commands;

  const display = filtered.slice(0, 12);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  const handleSubmit = (_v: string) => {
    if (display.length > 0) {
      onSelect('/' + display[selectedIdx]!.name);
    }
  };

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.upArrow) {
      setSelectedIdx((i) => (i > 0 ? i - 1 : display.length - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIdx((i) => (i < display.length - 1 ? i + 1 : 0));
      return;
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.brand} paddingX={1} width="100%">
      <Box>
        <Text bold color={theme.brand}> / </Text>
        <TextInput
          value={query}
          onChange={setQuery}
          onSubmit={handleSubmit}
          placeholder="search commands..."
        />
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {display.length === 0 && (
          <Box><Text dimColor>No matching commands</Text></Box>
        )}
        {display.map((cmd, i) => (
          <Box key={cmd.name}>
            <Text>
              {i === selectedIdx ? <Text color={theme.brand}>▸ </Text> : <Text>  </Text>}
              <Text bold color={i === selectedIdx ? theme.brand : undefined}>
                /{cmd.name}
              </Text>
              {'  '}
              <Text dimColor>{cmd.summary}</Text>
              {cmd.argHint && <Text color={theme.dim}> {'<'}{cmd.argHint}{'>'}</Text>}
            </Text>
          </Box>
        ))}
      </Box>
      <Box>
        <Text dimColor>{filtered.length} commands</Text>
      </Box>
    </Box>
  );
};
