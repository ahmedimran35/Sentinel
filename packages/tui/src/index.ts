export { SentinelApp } from './app.js';
export type { SentinelAppProps, ConversationEntry, ToolCallEntry, BranchNode } from './app.js';
export { Header } from './components/header.js';
export { MessageList } from './components/message-list.js';
export { DiffView } from './components/diff-view.js';
export { PermissionPrompt } from './components/permission-prompt.js';
export { InputEditor } from './components/input-editor.js';
export { StatusBar } from './components/status-bar.js';
export { FilePicker } from './components/file-picker.js';
export { CommandPalette } from './components/command-palette.js';
export { OrchestratorTree } from './components/orchestrator-tree.js';
export { Toast } from './components/toast.js';
export { PermissionSettings } from './components/permission-settings.js';
export type { PerToolPermission } from './components/permission-settings.js';
export { useTheme, ThemeContext } from './theme-context.js';
export {
  sentinelTheme,
  darkTheme,
  lightTheme,
  gruvboxTheme,
  tokyonightTheme,
  catppuccinTheme,
  nordTheme,
  everforestTheme,
  kanagawaTheme,
  ayuTheme,
  oneDarkTheme,
  matrixTheme,
  systemTheme,
  themes,
} from './theme.js';
export type { Theme } from './theme.js';
export { loadCustomThemes } from './theme-loader.js';
export type { LoadCustomThemesOptions } from './theme-loader.js';
export { Keybinds } from './keybinds.js';
export type { Keybind } from './keybinds.js';
export { ScrollAccelerator, useScrollAcceleration } from './scroll-acceleration.js';
export type { ScrollAcceleratorConfig } from './scroll-acceleration.js';

export { getSlashCommand, parseSlashCommand, getCommandsForPalette } from './slash-commands.js';
export type { SlashCommand, SlashCommandContext } from './slash-commands.js';
export { FileReferenceResolver } from './file-reference.js';
export { BashPrefixHandler } from './bash-prefix.js';
export type { BashResult } from './bash-prefix.js';
export { UndoRedoManager } from './undo-redo.js';
export { loadTUIConfig } from './tui-config.js';
export type { TUIConfig, AttentionConfig, DiffStyle } from './tui-config.js';
export { fireAttention, getAttentionTitle } from './attention.js';
export { AgentManager } from './components/agent-manager.js';
export type { AgentTab, AgentManagerProps } from './components/agent-manager.js';
export { ModelPicker, createModelList } from './components/model-picker.js';
export type { ModelEntry, ModelPickerProps, ModelPickerConfig } from './components/model-picker.js';
export { AutocompleteEngine, DEFAULT_AUTOCOMPLETE_CONFIG } from './autocomplete.js';
export type { AutocompleteConfig } from './autocomplete.js';

export { ParticleDust } from './components/particle-dust.js';
export { RippleEffect } from './components/ripple-effect.js';
export { TokenSparkline, MiniCtxBar } from './components/token-sparkline.js';
export { ConnectionGauge, MiniConnectionGauge } from './components/connection-gauge.js';
export type { ProviderStatus } from './components/connection-gauge.js';
export { BentoLayout, useLayoutMode } from './components/bento-layout.js';
export type { LayoutMode, BentoLayoutProps } from './components/bento-layout.js';
export { useParticleSystem } from './hooks/use-particle-system.js';
export type { Particle, ParticleSystemOptions, ParticleSystemResult } from './hooks/use-particle-system.js';
export { useRipple } from './hooks/use-ripple.js';
export type { Ripple, UseRippleResult } from './hooks/use-ripple.js';
export { useSharedAnimation, useSharedSpinner, useSharedPulse } from './hooks/use-shared-animation.js';
export { LiveTokenCounter } from './components/live-token-counter.js';
export { BashFlame } from './components/bash-flame.js';
export { ModelHealthDashboard } from './components/model-health-dashboard.js';
export { ConversationMinimap } from './components/conversation-minimap.js';
export { ScrollbackIndicator } from './components/scrollback-indicator.js';
export { VirtualList } from './components/virtual-list.js';
export { SplitLayout } from './components/split-layout.js';
export type { PaneConfig, PaneDirection } from './components/split-layout.js';
export { SessionTree } from './components/session-tree.js';
export type { SessionNode } from './components/session-tree.js';
export { ContextGauge } from './components/context-gauge.js';
export type { ContextBreakdown } from './components/context-gauge.js';
export { Badge, ProgressBar, KeyHint } from './components/ink-ui.js';
export { SideBySideDiff } from './components/side-by-side-diff.js';
export { MultiSessionTabs } from './components/multi-session-tabs.js';
export type { SessionTab } from './components/multi-session-tabs.js';
export { WebPreview } from './components/web-preview.js';
export { WorkflowComposer } from './components/workflow-composer.js';
export type { WorkflowStep } from './components/workflow-composer.js';
export { LSPDiagnostics } from './components/lsp-diagnostics.js';
export type { FileDiagnostic } from './components/lsp-diagnostics.js';
export { WebBridge } from './components/web-bridge.js';
