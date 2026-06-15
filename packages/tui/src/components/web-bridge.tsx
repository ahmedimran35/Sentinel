import { Box, Text, useInput } from 'ink';
import { useState, useCallback, useRef, memo } from 'react';
import { useTheme } from '../theme-context.js';

interface WebBridgeProps {
  webPort?: number;
  onLaunchWeb?: () => Promise<number>;
  onStopWeb?: () => Promise<void>;
}

export const WebBridge = memo(({ webPort: initialPort, onLaunchWeb, onStopWeb }: WebBridgeProps) => {
  const theme = useTheme();
  const [port, setPort] = useState(initialPort ?? 0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const launching = useRef(false);

  const toggleWeb = useCallback(async () => {
    if (launching.current) return;
    launching.current = true;
    try {
      if (running) {
        await onStopWeb?.();
        setRunning(false);
        setPort(0);
      } else {
        const p = await onLaunchWeb?.() ?? 0;
        setPort(p);
        setRunning(true);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      launching.current = false;
    }
  }, [running, onLaunchWeb, onStopWeb]);

  useInput((_input, key) => {
    if (key.ctrl && _input === 'w') {
      toggleWeb();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1} width="100%">
      <Box gap={1} alignItems="center">
        <Text color={running ? theme.success : theme.dim}>{running ? '\u25CF' : '\u25CB'}</Text>
        <Text bold color={theme.text}>Web UI</Text>
        {running && port > 0 ? (
          <Box gap={1}>
            <Text color={theme.info}>{'\u2197'} http://localhost:{port}</Text>
            <Text dimColor>(Ctrl+W to stop)</Text>
          </Box>
        ) : (
          <Box gap={1}>
            <Text dimColor>offline</Text>
            <Text dimColor>(Ctrl+W to launch)</Text>
          </Box>
        )}
        {error && <Text color={theme.error}>{error}</Text>}
      </Box>
      {running && (
        <Box marginTop={1} gap={1}>
          <Text dimColor>{'\u25C9'} Hybrid mode — TUI + Web UI active</Text>
        </Box>
      )}
    </Box>
  );
});
