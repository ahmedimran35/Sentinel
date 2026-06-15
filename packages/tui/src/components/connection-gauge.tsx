import { Box, Text } from 'ink';
import { memo } from 'react';
import { useTheme } from '../theme-context.js';
import { useAnimation } from '../hooks/use-animation.js';

export interface ProviderStatus {
  name: string;
  latency: number;
  healthy: boolean;
  model: string;
}

interface ConnectionGaugeProps {
  providers: ProviderStatus[];
  compact?: boolean;
}

const BAR_FILL = '\u2588';
const BAR_EMPTY = '\u2581';

function SignalBars({ latency, healthy }: { latency: number; healthy: boolean }) {
  const theme = useTheme();
  const { frame } = useAnimation({ interval: 200 });
  const barCount = 4;
  const bars = healthy
    ? Math.min(Math.round((1 - Math.min(latency / 5000, 1)) * barCount), barCount)
    : 0;
  const scanPos = frame % barCount;

  return (
    <Box gap={0}>
      {Array.from({ length: barCount }, (_, i) => {
        const filled = i < bars;
        const scanning = healthy && i === scanPos;
        const color = !healthy
          ? theme.error
          : bars >= 3
            ? theme.success
            : bars >= 2
              ? theme.warning
              : theme.error;

        return (
          <Text key={i} color={scanning ? theme.brand : color}>
            {filled ? BAR_FILL : BAR_EMPTY}
          </Text>
        );
      })}
    </Box>
  );
}

export const ConnectionGauge = memo(({ providers, compact }: ConnectionGaugeProps) => {
  const theme = useTheme();

  if (providers.length === 0) return null;

  if (compact) {
    const totalHealthy = providers.filter((p) => p.healthy).length;
    const total = providers.length;
    const color = totalHealthy === total ? theme.success : totalHealthy > 0 ? theme.warning : theme.error;
    return (
      <Text color={color}>
        {'\u25C9'} {totalHealthy}/{total}
      </Text>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1}>
      <Text color={theme.info}>{'\u25C9'} providers</Text>
      {providers.map((p) => (
        <Box key={p.name} gap={1} alignItems="center">
          <SignalBars latency={p.latency} healthy={p.healthy} />
          <Text color={p.healthy ? theme.success : theme.error}>
            {p.healthy ? '\u25C9' : '\u25CB'}
          </Text>
          <Text color={theme.text}>{p.name}</Text>
          <Text dimColor>{p.model}</Text>
          <Text dimColor>{p.latency}ms</Text>
        </Box>
      ))}
    </Box>
  );
});

export const MiniConnectionGauge = ({ providers }: { providers: ProviderStatus[] }) => {
  return <ConnectionGauge providers={providers} compact />;
};
