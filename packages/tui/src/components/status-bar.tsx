import { Box, Text } from 'ink';
import type { FunctionComponent } from 'react';

interface StatusBarProps {
  modelName: string;
  mode: 'plan' | 'build' | 'auto' | 'yolo';
  contextRatio: number;
  cost: number;
}

const MODE_COLORS: Record<string, string> = {
  plan: '#61afef',
  build: '#98c379',
  auto: '#e5c07b',
  yolo: '#e06c75',
};

export const StatusBar: FunctionComponent<StatusBarProps> = ({ modelName, mode, contextRatio, cost }) => {
  const ratioColor = contextRatio > 0.9 ? '#e06c75' : contextRatio > 0.7 ? '#e5c07b' : '#888';
  const modeColor = MODE_COLORS[mode] ?? '#888';

  return (
    <Box borderStyle="single" borderColor="#444" width="100%">
      <Box flexGrow={1}>
        <Text color={modeColor} bold> {modelName} </Text>
        <Text color={modeColor}> · {mode.toUpperCase()} </Text>
      </Box>
      <Box>
        <Text color={ratioColor}> ctx {Math.round(contextRatio * 100)}% </Text>
        <Text dimColor> · ${cost.toFixed(4)} </Text>
        <Text dimColor> · ⏎ send </Text>
        <Text dimColor> esc interrupt </Text>
      </Box>
    </Box>
  );
};
