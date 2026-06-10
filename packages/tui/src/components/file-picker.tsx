import { Box, Text } from 'ink';
import type { FunctionComponent } from 'react';

interface FilePickerProps {
  results: string[];
  onSelect: (path: string) => void;
  onCancel: () => void;
  onSearch: (query: string) => void;
}

export const FilePicker: FunctionComponent<FilePickerProps> = ({ results }) => {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#444">
      <Box>
        <Text dimColor>@file </Text>
        {results.length > 0 && (
          <Text>{results[0]}</Text>
        )}
      </Box>
      {results.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {results.slice(0, 10).map((r) => (
            <Text key={r}>
              {r.replace(process.cwd() + '/', '')}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
};
