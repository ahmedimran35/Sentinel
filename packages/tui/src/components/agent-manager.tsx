import { useCallback, type FunctionComponent, type ReactNode } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../theme-context.js';

export interface AgentTab {
  id: string;
  name: string;
  agentType: string;
  modelName?: string;
  status: 'active' | 'idle' | 'error';
}

export interface AgentManagerProps {
  projectName: string;
  tabs: AgentTab[];
  activeTabId: string;
  renderTab: (tabId: string) => ReactNode;
  onCreateAgent?: (name: string, type: string, model?: string) => Promise<void>;
  onCloseAgent?: (id: string) => Promise<void>;
  onSwitchAgent?: (id: string) => void;
}

const AGENT_ICONS: Record<string, string> = {
  chat: '\u266B',
  code: '\u2699',
  search: '\u2315',
  agent: '\u2606',
};

function getAgentIcon(type: string): string {
  return AGENT_ICONS[type.toLowerCase()] ?? '\u2606';
}

function statusColor(status: AgentTab['status'], theme: { success: string; warning: string; error: string }): string {
  switch (status) {
    case 'active': return theme.success;
    case 'idle': return theme.warning;
    case 'error': return theme.error;
  }
}

export const AgentManager: FunctionComponent<AgentManagerProps> = ({
  tabs,
  activeTabId,
  renderTab,
  onCreateAgent: _onCreateAgent,
  onCloseAgent,
  onSwitchAgent,
}) => {
  const theme = useTheme();

  const activeIdx = tabs.findIndex((t) => t.id === activeTabId);
  const safeActiveIdx = activeIdx >= 0 ? activeIdx : 0;

  const cycleTab = useCallback((delta: number) => {
    if (tabs.length === 0) return;
    const cur = tabs.findIndex((t) => t.id === activeTabId);
    const nextIdx = ((cur >= 0 ? cur : 0) + delta + tabs.length) % tabs.length;
    const next = tabs[nextIdx];
    if (next) onSwitchAgent?.(next.id);
  }, [tabs, activeTabId, onSwitchAgent]);

  const closeCurrentTab = useCallback(() => {
    if (tabs.length <= 1) return;
    const closing = tabs.findIndex((t) => t.id === activeTabId);
    const nextIdx = closing === tabs.length - 1 ? closing - 1 : closing + 1;
    const next = tabs[nextIdx];
    if (next) onSwitchAgent?.(next.id);
    onCloseAgent?.(activeTabId);
  }, [tabs, activeTabId, onSwitchAgent, onCloseAgent]);

  useInput((input, key) => {
    if (key.ctrl && key.tab && !key.shift) {
      cycleTab(1);
      return;
    }
    if (key.ctrl && key.shift && key.tab) {
      cycleTab(-1);
      return;
    }
    if (key.ctrl && input === 'w' && tabs.length > 1) {
      closeCurrentTab();
      return;
    }
  });

  return (
    <Box flexDirection="column" height="100%">
      <Box flexDirection="row" width="100%">
        {tabs.map((tab, i) => {
          const isActive = tab.id === activeTabId;
          const borderColor = isActive ? theme.borderFocus : theme.border;
          return (
            <Box
              key={tab.id}
              borderStyle="round"
              borderColor={borderColor}
              paddingX={1}
              marginRight={i < tabs.length - 1 ? 0 : undefined}
              marginBottom={-1}
              width={30}
            >
              <Text>
                <Text color={statusColor(tab.status, theme)}>
                  {'\u25CF'}
                </Text>
                {' '}
                <Text color={theme.text}>{getAgentIcon(tab.agentType)}</Text>
                {' '}
                <Text bold color={isActive ? theme.brand : theme.text}>
                  {tab.name}
                </Text>
                {' '}
                <Text
                  color={theme.dim}
                  wrap="truncate"
                >
                  {tab.modelName ?? ''}
                </Text>
                {' '}
                <Text color={theme.muted}>
                  {'\u00D7'}
                </Text>
              </Text>
            </Box>
          );
        })}
        <Box
          borderStyle="round"
          borderColor={theme.border}
          paddingX={1}
          marginBottom={-1}
        >
          <Text color={theme.dim} bold>+</Text>
        </Box>
      </Box>

      <Box
        borderStyle="round"
        borderColor={theme.borderFocus}
        flexGrow={1}
        paddingX={1}
      >
        {tabs.length > 0 && safeActiveIdx >= 0 && safeActiveIdx < tabs.length ? (
          renderTab(tabs[safeActiveIdx]!.id)
        ) : (
          <Box flexGrow={1} alignItems="center" justifyContent="center">
            <Text dimColor>No agent sessions. Press <Text bold>+</Text> to create one.</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
