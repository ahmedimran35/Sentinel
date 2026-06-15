import { useState, useCallback, useRef, useEffect, useMemo, memo, type FunctionComponent } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { ThemeContext } from './theme-context.js';
import { darkTheme } from './theme.js';
import type { Theme } from './theme.js';
import { Header } from './components/header.js';
import { MessageList } from './components/message-list.js';
import { InputEditor } from './components/input-editor.js';
import { ProviderWizard } from './components/provider-wizard.js';
import type { ProviderInfo } from './components/provider-wizard.js';
import { ThinkingIndicator } from './components/thinking-indicator.js';
import { PermissionPrompt } from './components/permission-prompt.js';
import { PermissionSettings } from './components/permission-settings.js';
import type { PerToolPermission } from './components/permission-settings.js';
import { StatusBar } from './components/status-bar.js';
import { ConversationMinimap } from './components/conversation-minimap.js';
import { ModelHealthDashboard } from './components/model-health-dashboard.js';
import type { ProviderStatus } from './components/connection-gauge.js';
import { ScrollbackIndicator } from './components/scrollback-indicator.js';
import { RippleEffect } from './components/ripple-effect.js';
import { BentoLayout, useLayoutMode } from './components/bento-layout.js';
import { useRipple } from './hooks/use-ripple.js';
import type { SentinelEvent } from '@sentinel/sdk';
import path from 'node:path';
import fs from 'node:fs';
import { parseSlashCommand, getCommandsForPalette } from './slash-commands.js';
import type { SlashCommandContext } from './slash-commands.js';
import { FileReferenceResolver } from './file-reference.js';
import { BashPrefixHandler } from './bash-prefix.js';
import { UndoRedoManager } from './undo-redo.js';
import { loadTUIConfig } from './tui-config.js';
import type { AttentionConfig } from './tui-config.js';
import { fireAttention, getAttentionTitle } from './attention.js';
import { SessionTree } from './components/session-tree.js';
import { ContextGauge } from './components/context-gauge.js';
import { SideBySideDiff } from './components/side-by-side-diff.js';
import { KeyHint } from './components/ink-ui.js';
import { MultiSessionTabs, type SessionTab } from './components/multi-session-tabs.js';
import { WebPreview } from './components/web-preview.js';
import { WorkflowComposer, type WorkflowStep } from './components/workflow-composer.js';
import { LSPDiagnostics, type FileDiagnostic } from './components/lsp-diagnostics.js';
import { WebBridge } from './components/web-bridge.js';

interface ModelContext {
  match: string;
  size: number;
}

const MODEL_CONTEXT_WINDOWS: ModelContext[] = [
  { match: 'claude-sonnet-4', size: 200_000 },
  { match: 'claude-sonnet-3', size: 200_000 },
  { match: 'claude-opus', size: 200_000 },
  { match: 'claude-haiku', size: 200_000 },
  { match: 'gpt-4o', size: 128_000 },
  { match: 'gpt-4-turbo', size: 128_000 },
  { match: 'o1', size: 200_000 },
  { match: 'o3', size: 200_000 },
  { match: 'gpt-4.1', size: 1_000_000 },
  { match: 'gpt-4', size: 8_192 },
  { match: 'deepseek-v4', size: 1_000_000 },
  { match: 'deepseek-v3', size: 128_000 },
  { match: 'deepseek-r1', size: 128_000 },
  { match: 'step-3.7', size: 256_000 },
  { match: 'gemini-2.5', size: 1_000_000 },
  { match: 'gemini-2.0', size: 1_000_000 },
  { match: 'gemini-1.5', size: 1_000_000 },
  { match: 'llama-3.3', size: 128_000 },
  { match: 'llama-3.2', size: 128_000 },
  { match: 'llama-3.1', size: 128_000 },
  { match: 'llama-3', size: 8_192 },
  { match: 'mistral-large', size: 128_000 },
  { match: 'mistral-small', size: 32_000 },
  { match: 'mistral-nemo', size: 128_000 },
  { match: 'mixtral', size: 32_000 },
  { match: 'qwen3', size: 128_000 },
  { match: 'qwen2.5', size: 128_000 },
  { match: 'nemotron-3', size: 1_000_000 },
  { match: 'codestral', size: 256_000 },
  { match: 'command-r', size: 128_000 },
  { match: 'minimax-m2', size: 1_000_000 },
  { match: 'minimax-m1', size: 256_000 },
  { match: 'glm-5', size: 128_000 },
  { match: 'phi-4', size: 128_000 },
  { match: 'phi-3', size: 128_000 },
];

function getContextWindow(modelName: string): number {
  const normalized = modelName.toLowerCase().replace(/^[^/]+\//, '');
  for (const entry of MODEL_CONTEXT_WINDOWS) {
    if (normalized.includes(entry.match)) return entry.size;
  }
  return 128_000;
}

export interface ToolCallEntry {
  name: string;
  args: Record<string, unknown>;
  result?: string;
}

export type ConversationEntry =
  | { role: 'user'; content: string; tokens?: number }
  | { role: 'assistant'; content: string; tokens?: number; tools?: ToolCallEntry[] }
  | { role: 'diff'; content: string; tokens?: number }
  | { role: 'error'; message: string };

export interface BranchNode {
  id: string;
  label: string;
  createdAt: number;
  parentId?: string;
  entries: ConversationEntry[];
  children?: BranchNode[];
}

function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

type EventPusher = (e: SentinelEvent) => void;

interface ChatAreaProps {
  conversation: ConversationEntry[];
  visibleConversation: ConversationEntry[];
  showToolOutput: boolean;
  showThinking: boolean;
  isThinking: boolean;
  ripples: { id: number; x: number; y: number; radius: number; maxRadius: number; opacity: number; color: string }[];
  showSplitLayout: boolean;
  diffContent: string;
}

const ChatArea = memo(({ conversation, visibleConversation, showToolOutput, showThinking, isThinking, ripples, showSplitLayout, diffContent }: ChatAreaProps) => {
  if (showSplitLayout && diffContent) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box flexDirection="row" flexGrow={1}>
          <Box flexGrow={1} flexDirection="column">
            {conversation.length > visibleConversation.length && (
              <ScrollbackIndicator count={conversation.length - visibleConversation.length} />
            )}
            <MessageList conversation={visibleConversation} showToolOutput={showToolOutput} showThinking={showThinking} />
            <ThinkingIndicator isThinking={isThinking} />
            <RippleEffect ripples={ripples} />
          </Box>
          <Box width={50} marginLeft={1}>
            <SideBySideDiff diff={diffContent} />
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {conversation.length > visibleConversation.length && (
        <ScrollbackIndicator count={conversation.length - visibleConversation.length} />
      )}
      <MessageList conversation={visibleConversation} showToolOutput={showToolOutput} showThinking={showThinking} />
      <ThinkingIndicator isThinking={isThinking} />
      <RippleEffect ripples={ripples} />
    </Box>
  );
});

export interface SentinelAppProps {
  projectName?: string;
  sessionId?: string;
  modelName?: string;
  mode?: 'plan' | 'build' | 'auto' | 'yolo';
  showToolOutput?: boolean;
  showThinking?: boolean;
  theme?: Theme;
  onSend?: (message: string, pushEvent: EventPusher) => Promise<void>;
  commands?: Array<{ name: string; summary: string; usage: string; argHint?: string }>;
  initialHistory?: ConversationEntry[];
  providers?: ProviderInfo[];
  onConnectProvider?: (provider: string, apiKey: string) => Promise<string[]>;
  onSwitchProvider?: (provider: string, model: string) => Promise<void>;
  onPermissionResponse?: (response: 'y' | 'a' | 'n' | 'd') => void;
  onExit?: () => void;
  bus?: { on(type: string, listener: (event: unknown) => void): () => void; emit(event: unknown): void };
}

export const SentinelApp: FunctionComponent<SentinelAppProps> = ({
  projectName = 'sentinel',
  sessionId,
  modelName = 'claude-sonnet-4-20250514',
  mode: initialMode = 'auto',
  showToolOutput: initialShowToolOutput = true,
  showThinking: initialShowThinking = true,
  theme = darkTheme,
  onSend,
  commands: externalCommands,
  initialHistory,
  providers = DEFAULT_PROVIDERS,
  onConnectProvider,
  onSwitchProvider,
  onPermissionResponse,
  onExit: _onExit,
  bus,
}) => {
  const [conversation, setConversation] = useState<ConversationEntry[]>(initialHistory ?? []);
  const [wizardActive, setWizardActive] = useState(false);
  const [settingsActive, setSettingsActive] = useState(false);
  const [perToolPermissions, setPerToolPermissions] = useState<PerToolPermission[]>([]);
  const [defaultToolLevel, setDefaultToolLevel] = useState<'allow' | 'ask' | 'deny'>('ask');
  const [pendingPermission, setPendingPermission] = useState<{ turnId: string; action: string; risk: string } | null>(null);
  const [fileResults, setFileResults] = useState<string[]>([]);
  const [mode, setMode] = useState<string>(initialMode);
  const [showToolOutput, setShowToolOutput] = useState(initialShowToolOutput);
  const [showThinking, setShowThinking] = useState(initialShowThinking);
  const [config, setConfig] = useState<Record<string, unknown>>({
    showToolOutput: initialShowToolOutput,
    showThinking: initialShowThinking,
  });
  const [tuiConfig] = useState(() => {
    try { return loadTUIConfig(); }
    catch { return DEFAULT_TUI_CONFIG; }
  });
  const [showSplitLayout, setShowSplitLayout] = useState(false);
  const [diffContent, setDiffContent] = useState('');
  const [branchNodes, setBranchNodes] = useState<BranchNode[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | undefined>();
  const [showKeyHints, setShowKeyHints] = useState(true);
  const [sessions, setSessions] = useState<SessionTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('main');
  const [workflowSteps, _setWorkflowSteps] = useState<WorkflowStep[]>([
    { id: 'plan', label: 'Plan', type: 'agent', status: 'done', detail: 'Project structure analyzed' },
    { id: 'code', label: 'Code Generation', type: 'agent', status: 'running', detail: 'Writing implementation...', children: [
      { id: 'code-1', label: 'Parse specs', type: 'tool', status: 'done' },
      { id: 'code-2', label: 'Generate files', type: 'agent', status: 'running' },
    ]},
    { id: 'review', label: 'Code Review', type: 'gate', status: 'pending' },
    { id: 'test', label: 'Run Tests', type: 'parallel', status: 'pending', children: [
      { id: 'test-unit', label: 'Unit tests', type: 'tool', status: 'pending' },
      { id: 'test-e2e', label: 'E2E tests', type: 'tool', status: 'pending' },
    ]},
  ]);
  const [lsDiagnostics, _setLspDiagnostics] = useState<FileDiagnostic[]>([]);
  const [webPort, setWebPort] = useState(0);
  const [_webRunning, setWebRunning] = useState(false);
  const [showTier3, setShowTier3] = useState(false);

  const attentionConfig = useRef<AttentionConfig>(tuiConfig.attention);
  const fileSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRefResolver = useRef(new FileReferenceResolver(process.cwd()));
  const bashHandler = useRef(new BashPrefixHandler());
  const undoManager = useRef(new UndoRedoManager(process.cwd()));
  const stateChangeListeners = useRef<Set<() => void>>(new Set());
  const { ripples, trigger: triggerRipple } = useRipple(true);
  const layoutMode = useLayoutMode();
  const { stdout } = useStdout();
  const rows = stdout.rows ?? 24;
  const cols = stdout.columns ?? 80;

  const modelStatuses: ProviderStatus[] = useMemo(() => MODEL_STATUSES, []);
  const contextMax = useMemo(() => getContextWindow(modelName), [modelName]);

  const contextUsed = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < conversation.length; i++) {
      const entry = conversation[i];
      if (!entry) continue;
      if ('tokens' in entry && typeof entry.tokens === 'number') sum += entry.tokens;
      else if (entry.role === 'user' || entry.role === 'assistant') sum += countTokens(entry.content);
    }
    return sum;
  }, [conversation]);

  const visibleConversation = useMemo(
    () => conversation.slice(-Math.max(10, Math.floor(rows / 3))),
    [conversation, rows],
  );

  const busyRef = useRef(false);
  const [, forceRender] = useState(0);
  const compactTriggeredRef = useRef(false);

  const setBusy = useCallback((v: boolean) => {
    if (busyRef.current !== v) {
      busyRef.current = v;
      forceRender((n) => n + 1);
    }
  }, []);

  const mergedCommands = useMemo(() => {
    const builtIn = getCommandsForPalette();
    if (externalCommands) {
      const existing = new Set(builtIn.map((c) => c.name));
      for (const cmd of externalCommands) {
        if (!existing.has(cmd.name)) {
          builtIn.push(cmd);
          existing.add(cmd.name);
        }
      }
    }
    return builtIn;
  }, [externalCommands]);

  const batchRef = useRef('');
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushBatch = useCallback(() => {
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    const text = batchRef.current;
    if (!text) return;
    batchRef.current = '';
    setConversation((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant') {
        const fullContent = last.content + text;
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: fullContent, tokens: countTokens(fullContent) };
        return updated;
      }
      return [...prev, { role: 'assistant', content: text, tokens: countTokens(text) }];
    });
  }, []);

  const toggleSplitLayout = useCallback(() => setShowSplitLayout(prev => !prev), []);

  const pushEvent = useCallback((e: SentinelEvent) => {
    if (e.type === 'text_delta') {
      batchRef.current += e.delta;
      if (!batchTimerRef.current) {
        batchTimerRef.current = setTimeout(flushBatch, 30);
      }
      return;
    }
    flushBatch();
    if (e.type === 'tool_call_start') {
      const parsed = e.call.args as Record<string, unknown>;
      setConversation((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          const updated = [...prev];
          const tools = last.tools ?? [];
          updated[updated.length - 1] = {
            ...last,
            tools: [...tools, { name: e.call.name, args: parsed }],
          };
          return updated;
        }
        return [...prev, { role: 'assistant', content: '', tools: [{ name: e.call.name, args: parsed }] }];
      });
    }
    if (e.type === 'tool_result') {
      const output = e.result.output;
      if (output && e.result.output.length < 5000) {
        setDiffContent(output);
      }
      setConversation((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role !== 'assistant' || !last.tools?.length) return prev;
        const tools = [...last.tools];
        const lastTool = tools[tools.length - 1];
        if (!lastTool) return prev;
        tools[tools.length - 1] = { ...lastTool, result: output };
        const updated = [...prev];
        updated[updated.length - 1] = { ...last, tools };
        return updated;
      });
    }
    if (e.type === 'error') {
      setConversation((prev) => [...prev, { role: 'error', message: e.message }]);
      fireAttention(attentionConfig.current, getAttentionTitle('error'), e.message);
    }
    if (e.type === 'compact_boundary') {
      setConversation([]);
      setBranchNodes(prev => [...prev, {
        id: `branch_${Date.now()}`,
        label: `Checkpoint ${prev.length + 1}`,
        createdAt: Date.now(),
        parentId: activeBranchId,
        entries: [],
      }]);
    }
    if (e.type === 'awaiting_permission') {
      setPendingPermission({ turnId: e.turnId, action: e.action, risk: e.risk });
      fireAttention(attentionConfig.current, getAttentionTitle('permission'), `Action: ${e.action} (${e.risk})`);
    }
    if (e.type === 'turn_end') {
      fireAttention(attentionConfig.current, getAttentionTitle('done'), `Turn ${e.turnId} completed`);
    }
  }, [flushBatch, activeBranchId]);

  useEffect(() => {
    return () => {
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
    };
  }, []);

  const compactRef = useRef({ onSend, pushEvent });
  compactRef.current = { onSend, pushEvent };
  useEffect(() => {
    if (compactTriggeredRef.current) return;
    if (contextMax <= 0) return;
    const ratio = contextUsed / contextMax;
    if (ratio > 0.9) {
      compactTriggeredRef.current = true;
      const msg = `\u26A0\uFE0F Context at ${Math.round(ratio * 100)}% — auto-compacting.`;
      setConversation([{ role: 'assistant', content: msg, tokens: countTokens(msg) }]);
      setTimeout(() => {
        const ref = compactRef.current;
        ref.onSend?.('/compact auto', ref.pushEvent);
      }, 0);
    }
  }, [contextUsed, contextMax]);

  const createBranch = useCallback((label: string) => {
    const id = `branch_${Date.now()}`;
    setBranchNodes(prev => [...prev, {
      id,
      label,
      createdAt: Date.now(),
      parentId: activeBranchId,
      entries: [],
    }]);
    setActiveBranchId(id);
  }, [activeBranchId]);

  useInput((_input, key) => {
    if (key.ctrl && key.shift && (_input === 'p' || _input === 'P')) {
      if (!settingsActive) setSettingsActive(true);
      return;
    }
    if (key.escape && settingsActive) {
      setSettingsActive(false);
      return;
    }
    if (key.ctrl && _input === 'd') {
      toggleSplitLayout();
      return;
    }
    if (key.ctrl && _input === 'b') {
      createBranch(`Branch ${branchNodes.length + 1}`);
      return;
    }
    if (key.ctrl && _input === 'h') {
      setShowKeyHints(prev => !prev);
      return;
    }
    if (key.ctrl && _input === 't') {
      const id = `session_${Date.now()}`;
      setSessions(prev => [...prev, {
        id,
        label: `Session ${prev.length + 1}`,
        status: 'idle',
        content: <Text dimColor>Session {prev.length + 1}</Text>,
      }]);
      setActiveTabId(id);
      return;
    }
    if (key.ctrl && key.shift && _input === 'w' && sessions.length > 1) {
      setSessions(prev => prev.filter(s => s.id !== activeTabId));
      if (sessions[0]) setActiveTabId(sessions[0].id);
      return;
    }
    if (key.ctrl && _input === '3') {
      setShowTier3(prev => !prev);
      return;
    }
  });

  const submitMessage = useCallback(async (value: string) => {
    if (busyRef.current) return;

    if (value === '/provider') {
      setWizardActive(true);
      return;
    }

    const slashCtx: SlashCommandContext = {
      appendOutput(text: string) {
        setConversation((prev) => [...prev, { role: 'assistant', content: text, tokens: countTokens(text) }]);
      },
      sendMessage(text: string) {
        submitMessage(text);
      },
      getHistory() {
        return conversation.map((entry) => ({
          role: entry.role,
          content: entry.role === 'user' || entry.role === 'assistant' ? entry.content : '',
        }));
      },
      setMode(m: string) { setMode(m); },
      getMode() { return mode; },
      getConfig() { return config; },
      setConfig(key: string, val: unknown) {
        setConfig((prev) => ({ ...prev, [key]: val }));
        if (key === 'showToolOutput') setShowToolOutput(val as boolean);
        if (key === 'showThinking') setShowThinking(val as boolean);
        if (key === 'showWizard') setWizardActive(val as boolean);
      },
      onStateChange(cb: () => void) {
        stateChangeListeners.current.add(cb);
      },
      bus: bus ?? { on: () => () => {}, emit: () => {} },
      sessionId,
      projectRoot: process.cwd(),
    };

    const parsed = parseSlashCommand(value);
    if (parsed.command) {
      setConversation((prev) => [...prev, { role: 'user', content: value, tokens: countTokens(value) }]);
      await parsed.command.execute(parsed.args, slashCtx);
      return;
    }

    if (bashHandler.current.isBashCommand(value)) {
      setConversation((prev) => [...prev, { role: 'user', content: value, tokens: countTokens(value) }]);
      setBusy(true);
      try {
        const result = await bashHandler.current.execute(value);
        const formatted = bashHandler.current.formatToolResult(result);
        setConversation((prev) => [
          ...prev,
          { role: 'assistant', content: formatted, tokens: countTokens(formatted), tools: [{ name: 'bash', args: { command: result.command }, result: result.output }] },
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setConversation((prev) => [...prev, { role: 'error', message: msg }]);
      } finally {
        setBusy(false);
      }
      return;
    }

    let resolvedValue = value;
    try {
      const refResult = await fileRefResolver.current.resolve(value);
      resolvedValue = refResult.text;
    } catch {
      // passthrough
    }

    const msgIdx = conversation.length;
    try {
      await undoManager.current.snapshot(msgIdx);
    } catch {
      // undo not available
    }

    triggerRipple(40, 1, theme.brand);
    setConversation((prev) => [...prev, { role: 'user', content: resolvedValue, tokens: countTokens(resolvedValue) }]);
    setBusy(true);

    try {
      await onSend?.(resolvedValue, pushEvent);
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'AbortError'
        ? 'Request timed out'
        : err instanceof Error ? err.message : String(err);
      setConversation((prev) => [...prev, { role: 'error', message: msg }]);
    } finally {
      flushBatch();
      setBusy(false);
    }
  }, [onSend, pushEvent, flushBatch, conversation, mode, config, bus, theme, triggerRipple]);

  const handleInput = useCallback((value: string) => {
    submitMessage(value);
  }, [submitMessage]);

  const handlePermissionResponse = useCallback((response: 'y' | 'a' | 'n' | 'd') => {
    setPendingPermission(null);
    onPermissionResponse?.(response);
  }, [onPermissionResponse]);

  const handlePermissionSettingsChange = useCallback((permissions: PerToolPermission[], defaultLevel: 'allow' | 'ask' | 'deny') => {
    setPerToolPermissions(permissions);
    setDefaultToolLevel(defaultLevel);
  }, []);

  const handleFileSearch = useCallback(async (q: string) => {
    if (fileSearchTimer.current) clearTimeout(fileSearchTimer.current);
    if (!q) { setFileResults([]); return; }
    fileSearchTimer.current = setTimeout(async () => {
      const results: string[] = [];
      try {
        const base = process.cwd();
        const entries = await fs.promises.readdir(base, { withFileTypes: true });
        const searchResults = entries
          .filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))
          .map((e) => path.resolve(base, e.name))
          .slice(0, 20);
        setFileResults(searchResults);
      } catch { /* ignore */ }
      setFileResults(results);
    }, 150);
  }, []);

  const handleFileSelect = useCallback(() => { setFileResults([]); }, []);
  const handleFileCancel = useCallback(() => { setFileResults([]); }, []);

  return (
    <ThemeContext.Provider value={theme}>
      <Box flexDirection="column" height="100%">
        <Box marginBottom={1}>
          <Header projectName={projectName} sessionId={sessionId} />
        </Box>

        {showKeyHints && cols >= 80 && (
          <Box marginBottom={1} gap={1}>
            <KeyHint keys={['^D']} description="diff split" />
            <KeyHint keys={['^B']} description="new branch" />
            <KeyHint keys={['^3']} description="tier3 panel" />
            <KeyHint keys={['^T']} description="new tab" />
            <KeyHint keys={['^⇧W']} description="close tab" />
            <KeyHint keys={['^H']} description="hide hints" />
            <KeyHint keys={['^⇧P']} description="settings" />
          </Box>
        )}

        <BentoLayout
          main={
            showTier3 && sessions.length > 0 ? (
              <MultiSessionTabs
                sessions={[
                  {
                  id: 'main',
                  label: projectName,
                  status: bus ? 'running' : 'active',
                    content: (
                      <ChatArea
                        conversation={conversation}
                        visibleConversation={visibleConversation}
                        showToolOutput={showToolOutput}
                        showThinking={showThinking}
                        isThinking={busyRef.current}
                        ripples={ripples}
                        showSplitLayout={showSplitLayout}
                        diffContent={diffContent}
                      />
                    ),
                    model: modelName,
                  },
                  ...sessions,
                ]}
                activeId={activeTabId}
                onSwitch={setActiveTabId}
                onCreate={() => {
                  const id = `session_${Date.now()}`;
                  setSessions(prev => [...prev, {
                    id,
                    label: `Session ${prev.length + 1}`,
                    status: 'idle',
                    content: <Text dimColor>Session {prev.length + 1}</Text>,
                    model: modelName,
                  }]);
                  setActiveTabId(id);
                }}
                onClose={(id) => {
                  setSessions(prev => prev.filter(s => s.id !== id));
                  if (activeTabId === id) setActiveTabId('main');
                }}
              />
            ) : (
              <ChatArea
                conversation={conversation}
                visibleConversation={visibleConversation}
                showToolOutput={showToolOutput}
                showThinking={showThinking}
                isThinking={busyRef.current}
                ripples={ripples}
                showSplitLayout={showSplitLayout}
                diffContent={diffContent}
              />
            )
          }
          sidebar={
            layoutMode === 'bento' ? (
              <Box width={40} marginLeft={1} flexDirection="column" gap={1}>
                <ModelHealthDashboard providers={modelStatuses} />
                <ConversationMinimap conversation={conversation} height={Math.max(3, rows - 60)} />
                <Box borderStyle="round" paddingX={1}>
                  <ContextGauge used={contextUsed} max={contextMax} width={30} />
                </Box>
                {showTier3 && (
                  <>
                    <WorkflowComposer steps={workflowSteps} readOnly={false} />
                    <WebPreview markdown={conversation.length > 0 && conversation[conversation.length - 1]!.role === 'assistant' ? (conversation[conversation.length - 1] as { role: 'assistant'; content: string }).content : undefined} maxHeight={10} />
                    {lsDiagnostics.length > 0 && <LSPDiagnostics diagnostics={lsDiagnostics} maxItems={10} />}
                    <WebBridge
                      webPort={webPort}
                      onLaunchWeb={async () => { setWebRunning(true); setWebPort(4096); return 4096; }}
                      onStopWeb={async () => { setWebRunning(false); setWebPort(0); }}
                    />
                  </>
                )}
                {branchNodes.length > 0 && (
                  <SessionTree
                    nodes={branchNodes.map(n => ({
                      id: n.id,
                      label: n.label,
                      createdAt: n.createdAt,
                      parentId: n.parentId,
                      children: n.children?.map(c => ({ id: c.id, label: c.label, createdAt: c.createdAt, parentId: c.parentId })),
                    }))}
                    activeId={activeBranchId}
                    onSelect={(id) => setActiveBranchId(id)}
                    maxHeight={Math.max(3, Math.floor(rows / 6))}
                  />
                )}
              </Box>
            ) : undefined
          }
          footer={
            pendingPermission ? (
              <PermissionPrompt
                action={pendingPermission.action}
                risk={pendingPermission.risk}
                onResponse={handlePermissionResponse}
              />
            ) : wizardActive ? (
              <ProviderWizard
                providers={providers}
                onConnect={async (provider, apiKey) => onConnectProvider?.(provider, apiKey) ?? []}
                onSwitch={async (provider, model) => { await onSwitchProvider?.(provider, model); }}
                onClose={() => setWizardActive(false)}
              />
            ) : settingsActive ? (
              <PermissionSettings
                permissions={perToolPermissions}
                defaultLevel={defaultToolLevel}
                onChange={handlePermissionSettingsChange}
                onClose={() => setSettingsActive(false)}
              />
            ) : (
              <InputEditor
                onSubmit={handleInput}
                disabled={busyRef.current}
                commands={mergedCommands}
                fileResults={fileResults}
                onFileSearch={handleFileSearch}
                onFileSelect={handleFileSelect}
                onFileCancel={handleFileCancel}
              />
            )
          }
        />

        <StatusBar modelName={modelName} mode={mode as 'plan' | 'build' | 'auto' | 'yolo'} contextUsed={contextUsed} contextMax={contextMax} />
      </Box>
    </ThemeContext.Provider>
  );
};

const DEFAULT_PROVIDERS: ProviderInfo[] = [
  { name: 'anthropic', label: 'Anthropic' },
  { name: 'nim', label: 'NVIDIA NIM' },
  { name: 'openai', label: 'OpenAI' },
  { name: 'openrouter', label: 'OpenRouter' },
];

const MODEL_STATUSES: ProviderStatus[] = [
  { name: 'Anthropic', latency: 340, healthy: true, model: 'claude-sonnet-4' },
  { name: 'OpenAI', latency: 520, healthy: true, model: 'gpt-4o' },
  { name: 'NVIDIA', latency: 0, healthy: false, model: 'n/a' },
  { name: 'OpenRouter', latency: 890, healthy: true, model: 'deepseek-v4' },
];

const DEFAULT_TUI_CONFIG = {
  attention: { enabled: false, notifications: true, sound: true, volume: 0.4 },
  diff_style: 'auto' as const,
};
