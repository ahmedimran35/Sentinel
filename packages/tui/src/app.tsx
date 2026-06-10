import { useState, useCallback, type FunctionComponent } from 'react';
import { Box } from 'ink';
import { Header } from './components/header.js';
import { MessageList } from './components/message-list.js';
import { PermissionPrompt } from './components/permission-prompt.js';
import { InputEditor } from './components/input-editor.js';
import { StatusBar } from './components/status-bar.js';
import { FilePicker } from './components/file-picker.js';
import { CommandPalette } from './components/command-palette.js';
import { OrchestratorTree } from './components/orchestrator-tree.js';
import { Toast } from './components/toast.js';
import type { SentinelEvent } from '@sentinel/sdk';

export interface SentinelAppProps {
  projectName?: string;
  modelName?: string;
  mode?: 'plan' | 'build' | 'auto' | 'yolo';
  onSend?: (message: string) => void;
  events?: SentinelEvent[];
  contextRatio?: number;
  cost?: number;
  orchestratorNodes?: Array<{
    role: string;
    status: 'running' | 'done' | 'error' | 'pending';
    detail?: string;
    children?: Array<{
      role: string;
      status: 'running' | 'done' | 'error' | 'pending';
      detail?: string;
    }>;
  }>;
}

export const SentinelApp: FunctionComponent<SentinelAppProps> = ({
  projectName = 'sentinel',
  modelName = 'claude-sonnet-4-20250514',
  mode = 'auto',
  onSend,
  events = [],
  contextRatio = 0.25,
  cost = 0,
  orchestratorNodes,
}) => {
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'warning' | 'error' } | null>(null);
  const [pendingPermission, setPendingPermission] = useState<{ action: string; risk: string } | null>(null);

  const isThinking = events.some((e) => e.type === 'turn_start') && !events.some((e) => e.type === 'turn_end');

  const handleInput = useCallback(
    (value: string) => {
      if (value.startsWith('/')) {
        if (value === '/help') {
          setToast({ message: 'Commands: /plan /review /test /debug /cost /clear /exit', type: 'info' });
          return;
        }
        if (value === '/clear') {
          setToast({ message: 'Cleared conversation history', type: 'info' });
          return;
        }
        if (value === '/exit') process.exit(0);
      }
      onSend?.(value);
    },
    [onSend],
  );

  const handlePermissionResponse = useCallback(
    (response: 'y' | 'a' | 'n' | 'd') => {
      setToast({ message: `Permission: ${response === 'y' || response === 'a' ? 'allowed' : 'denied'}`, type: response === 'y' || response === 'a' ? 'success' : 'error' });
      setPendingPermission(null);
    },
    [],
  );

  return (
    <Box flexDirection="column" height="100%">
      <Box marginBottom={1}>
        <Header projectName={projectName} isThinking={isThinking} />
      </Box>

      <Box flexGrow={1} flexDirection="row" width="100%">
        <Box flexGrow={1} flexDirection="column">
          {showFilePicker && (
            <FilePicker
              results={[]}
              onSelect={(path) => {
                setShowFilePicker(false);
                onSend?.(`@file ${path}`);
              }}
              onCancel={() => setShowFilePicker(false)}
              onSearch={() => {}}
            />
          )}

          {showCommandPalette && (
            <CommandPalette
              onSelect={(cmd) => {
                setShowCommandPalette(false);
                handleInput(cmd);
              }}
              onCancel={() => setShowCommandPalette(false)}
            />
          )}

          <MessageList events={events} />

          {pendingPermission && (
            <PermissionPrompt
              action={pendingPermission.action}
              risk={pendingPermission.risk}
              onResponse={handlePermissionResponse}
            />
          )}
        </Box>

        {orchestratorNodes && (
          <Box width={30} marginLeft={1}>
            <OrchestratorTree nodes={orchestratorNodes} />
          </Box>
        )}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

        <InputEditor onSubmit={handleInput} />
      </Box>

      <StatusBar
        modelName={modelName}
        mode={mode}
        contextRatio={contextRatio}
        cost={cost}
      />
    </Box>
  );
};
