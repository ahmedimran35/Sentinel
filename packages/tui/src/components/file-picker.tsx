import { Box, Text, useInput } from 'ink';
import { useState, type FunctionComponent } from 'react';
import TextInput from 'ink-text-input';
import { useTheme } from '../theme-context.js';

interface FilePickerProps {
  results: string[];
  onSelect: (path: string) => void;
  onCancel: () => void;
  onSearch: (query: string) => void;
}

export const FilePicker: FunctionComponent<FilePickerProps> = ({ results, onSelect, onCancel, onSearch }) => {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  const handleChange = (v: string) => {
    setQuery(v);
    setSelectedIdx(0);
    onSearch(v);
  };

  const handleSubmit = () => {
    if (results.length > 0) {
      onSelect(results[selectedIdx] ?? results[0]!);
    }
  };

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.upArrow) {
      setSelectedIdx((i) => (i > 0 ? i - 1 : results.length - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIdx((i) => (i < results.length - 1 ? i + 1 : 0));
      return;
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1}>
      <Box>
        <Text dimColor>@ </Text>
        <TextInput
          value={query}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder="search files..."
        />
      </Box>
      {results.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {results.slice(0, 10).map((r, i) => (
            <Text key={r}>
              {i === selectedIdx ? <Text color={theme.brand}>▸ </Text> : <Text>  </Text>}
              {r.replace(process.cwd() + '/', '')}
            </Text>
          ))}
        </Box>
      )}
      {results.length === 0 && query && (
        <Box marginTop={1}><Text dimColor>No matches</Text></Box>
      )}
    </Box>
  );
};
