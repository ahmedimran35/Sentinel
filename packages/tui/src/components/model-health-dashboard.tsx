import { Box, Text } from 'ink';
import type { FunctionComponent } from 'react';
import { useTheme } from '../theme-context.js';
import { useAnimation } from '../hooks/use-animation.js';
import type { ProviderStatus } from './connection-gauge.js';

interface ModelHealthDashboardProps {
  providers: ProviderStatus[];
}

const BAR_FILL = '\u2588';
const BAR_EMPTY = '\u2581';

function HealthBar({ latency, healthy }: { latency: number; healthy: boolean }) {
  const theme = useTheme();
  const { frame } = useAnimation({ interval: 150 });
  const bars = healthy
    ? Math.min(Math.round((1 - Math.min(latency / 3000, 1)) * 4), 4)
    : 0;
  const scan = frame % 4;
  const color = !healthy ? theme.error
    : bars >= 3 ? theme.success
    : bars >= 2 ? theme.warning
    : theme.error;

  return (
    <Box gap={0}>
      {Array.from({ length: 4 }, (_, i) => (
        <Text key={i} color={i === scan && healthy ? theme.brand : color}>
          {i < bars ? BAR_FILL : BAR_EMPTY}
        </Text>
      ))}
    </Box>
  );
}

export const ModelHealthDashboard: FunctionComponent<ModelHealthDashboardProps> = ({ providers }) => {
  const theme = useTheme();

  if (providers.length === 0) return null;

  const rows: ProviderStatus[][] = [];
  const perRow = Math.min(2, providers.length);
  for (let i = 0; i < providers.length; i += perRow) {
    rows.push(providers.slice(i, i + perRow));
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1}>
      <Text color={theme.info}>{'\u25C9'} model health</Text>
      <Text dimColor>{'\u2500'.repeat(20)}</Text>
      {rows.map((row, ri) => (
        <Box key={ri} gap={2}>
          {row.map((p) => (
            <Box key={p.name} flexDirection="column" minWidth={18}>
              <Box gap={1} alignItems="center">
                <HealthBar latency={p.latency} healthy={p.healthy} />
                <Text color={p.healthy ? theme.text : theme.error}>{p.name}</Text>
              </Box>
              <Box marginLeft={1}>
                <Text dimColor>{p.model}</Text>
              </Box>
              <Box marginLeft={1}>
                <Text dimColor>{p.latency}ms</Text>
                <Text color={p.healthy ? theme.success : theme.error} dimColor>
                  {' '}{p.healthy ? '\u25C9 online' : '\u25CB offline'}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
};
