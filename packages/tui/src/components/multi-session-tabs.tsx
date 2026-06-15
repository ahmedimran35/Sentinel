import { Box, Text, useInput } from 'ink';
import { useState, type FunctionComponent, type ReactNode } from 'react';
import { useTheme } from '../theme-context.js';

export interface SessionTab {
  id: string;
  label: string;
  status: 'active' | 'idle' | 'running' | 'error';
  content: ReactNode;
  provider?: string;
  model?: string;
}

interface MultiSessionTabsProps {
  sessions: SessionTab[];
  activeId: string;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onClose: (id: string) => void;
  onRename?: (id: string, label: string) => void;
  maxTabs?: number;
}

export const MultiSessionTabs: FunctionComponent<MultiSessionTabsProps> = ({
  sessions,
  activeId,
  onSwitch,
  onCreate,
  onClose,
  maxTabs = 8,
}) => {
  const theme = useTheme();
  const [_editId, _setEditId] = useState<string | null>(null);

  const statusColor = {
    active: theme.success,
    idle: theme.dim,
    running: theme.info,
    error: theme.error,
  };

  const statusDot = {
    active: '\u25CF',
    idle: '\u25CB',
    running: '\u25D4',
    error: '\u2717',
  };

  useInput((_input, key) => {
    if (sessions.length === 0) return;
    if (key.ctrl && _input === 't') {
      onCreate();
      return;
    }
    if (key.ctrl && key.shift && _input === 'w' && sessions.length > 1) {
      onClose(activeId);
      return;
    }
    if (key.ctrl && key.tab) {
      const idx = sessions.findIndex(s => s.id === activeId);
      const next = (idx + 1) % sessions.length;
      onSwitch(sessions[next]!.id);
      return;
    }
    if (key.ctrl && key.shift && key.tab) {
      const idx = sessions.findIndex(s => s.id === activeId);
      const prev = (idx - 1 + sessions.length) % sessions.length;
      onSwitch(sessions[prev]!.id);
      return;
    }
  });

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box flexDirection="row" gap={0} width="100%" minHeight={1}>
        {sessions.slice(0, maxTabs).map(session => {
          const isActive = session.id === activeId;
          return (
            <Box
              key={session.id}
              flexDirection="row"
              paddingX={1}
              gap={1}
              borderStyle={isActive ? 'round' : undefined}
              borderColor={isActive ? theme.brand : undefined}
            >
              <Text color={statusColor[session.status]}>{statusDot[session.status]}</Text>
              {_editId === session.id ? (
                <Text color={theme.text}>{session.label} </Text>
              ) : (
                <Text
                  bold={isActive}
                  color={isActive ? theme.brand : theme.text}
                  wrap="truncate"
                >
                  {session.label}
                </Text>
              )}
              {session.model && (
                <Text dimColor>{session.model.split('/').pop() ?? session.model}</Text>
              )}
              {isActive && sessions.length > 1 && (
                <Text dimColor>{'\u2715'}</Text>
              )}
            </Box>
          );
        })}
        {sessions.length < maxTabs && (
          <Box paddingX={1}>
            <Text color={theme.dim}>+</Text>
          </Box>
        )}
      </Box>
      <Box flexGrow={1} flexDirection="column" borderStyle="single" borderColor={theme.border}>
        {sessions.find(s => s.id === activeId)?.content ?? (
          <Box justifyContent="center" alignItems="center" flexGrow={1}>
            <Text dimColor>No session selected. Ctrl+T to create one.</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
