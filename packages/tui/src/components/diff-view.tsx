import { Box, Text } from 'ink';
import type { FunctionComponent } from 'react';

interface DiffLine {
  type: 'add' | 'del' | 'ctx';
  content: string;
}

interface DiffViewProps {
  diff: string;
  fullScreen?: boolean;
}

function parseDiff(diffText: string): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      lines.push({ type: 'add', content: line });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      lines.push({ type: 'del', content: line });
    } else {
      lines.push({ type: 'ctx', content: line });
    }
  }
  return lines;
}

export const DiffView: FunctionComponent<DiffViewProps> = ({ diff, fullScreen }) => {
  const parsed = parseDiff(diff);
  const maxLines = fullScreen ? parsed.length : Math.min(parsed.length, 20);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#444" marginLeft={2}>
      {parsed.slice(0, maxLines).map((line, i) => (
        <Box key={i}>
          {line.type === 'add' ? (
            <Text color="#98c379" backgroundColor="#2d3d2d">{line.content}</Text>
          ) : line.type === 'del' ? (
            <Text color="#e06c75" backgroundColor="#3d2d2d">{line.content}</Text>
          ) : (
            <Text dimColor>{line.content}</Text>
          )}
        </Box>
      ))}
      {!fullScreen && parsed.length > 20 && (
        <Text dimColor>... {parsed.length - 20} more lines (press d for full)</Text>
      )}
    </Box>
  );
};
