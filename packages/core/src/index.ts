export { EventBus } from './event-bus.js';
export { runTurn } from './run-turn.js';
export { Engine, discoverTools } from './engine.js';
export type { EngineConfig, EngineResult } from './engine.js';
export { MockProvider } from './mock-provider.js';
export { AlwaysAllowGate, EmittingGate, InteractiveGate } from './permission-gate.js';
export type { PermissionGate } from './permission-gate.js';
export type { RunTurnOptions } from './run-turn.js';
export type { ScriptedEvent } from './mock-provider.js';

// Phase 4 — Security
export { MODES, checkModePermission } from './modes.js';
export type { Mode, ModeConfig } from './modes.js';
export { analyzeBashCommand } from './bash-analyzer.js';
export type { AnalysisResult } from './bash-analyzer.js';
export { FilesystemJail } from './filesystem-jail.js';
export { redactSecrets } from './secret-redactor.js';
export { ConfiguredGate } from './configured-gate.js';
export type { GateConfig, PermissionRule } from './configured-gate.js';

// Granular per-tool permissions
export { PermissionResolver, DEFAULT_PERMISSIONS } from './permission-resolver.js';
export type { PermissionAction, PermissionConfig, PerToolPermission, ToolPermissionLevel } from './permission-resolver.js';

// Phase 5 — LSP + AGENTS.md
export { LSPManager, detectLanguage } from './lsp-manager.js';
export type { Diagnostic } from './lsp-manager.js';
export { LSPLifecycle } from './lsp-lifecycle.js';
export type { LSPSymbol, LSPLocation, LSPHoverResult } from './lsp-manager.js';
export { builtinLSPServers, getServerForFile, findServerByName } from './lsp-servers.js';
export type { LSPServerDef } from './lsp-servers.js';
export { analyzeRepo, generateAgentsMd, initAgentsMd, loadGlobalAgentsMd, loadInstructionFiles } from './agents-init.js';
export type { RepoAnalysis } from './agents-init.js';

// Config variable substitution
export { substConfigVars, substConfigObject } from './config-subst.js';

// Config system overhaul — multi-level loader, schema, env vars, variables
export { loadConfig, ConfigSource } from './config-loader.js';
export type { ConfigLevel } from './config-loader.js';
export { SentinelConfigSchema } from './config-schema.js';
export type {
  SentinelConfig,
  FormatterEntryConfig,
  LSPEntryConfig,
  MCPEntryConfig,
  CustomToolEntry,
} from './config-schema.js';
export { resolveConfigVars, resolveConfigObject } from './config-vars.js';
export { loadEnvConfig } from './env-vars.js';
export type { EnvConfig } from './env-vars.js';

// Phase 6 — Context management + orchestration
export { ContextManager, createDefaultCompactionPolicy } from './context-manager.js';
export type { CompactionResult, CompactionPolicy } from './context-manager.js';
export { MemoryBank } from './memory-bank.js';
export { Orchestrator } from './orchestrator.js';
export type { OrchestratorStep, OrchestrationResult } from './orchestrator.js';

// MCP integration
export { getMcpTools } from './mcp-integration.js';

// Custom tools
export { loadCustomTools } from './custom-tools.js';

// Session persistence
export { saveSession, loadSession, listSessions, removeSession, findLastSession } from './session-store.js';
export type { SavedSession } from './session-store.js';

// Session tree
export { SessionTreeManager } from './session-tree.js';
export type { SessionTreeNode } from './session-tree.js';

// Session undo/redo
export { SessionUndoManager } from './session-undo.js';
export type { UndoEntry } from './session-undo.js';

// Session sharing
export { shareSession, exportSession, importSession, SessionNotFoundError, InvalidShareJsonError } from './session-share.js';
export { CommandRegistry, ShadowGit, parseArgs } from './commands/index.js';
export { loadCustomCommands, refreshCustomCommands } from './commands/index.js';
export { groupACommands, groupBCommands, groupCCommands, groupDCommands, groupECommands, groupFCommands, groupGCommands } from './commands/index.js';
export { createProvider } from './commands/provider-factory.js';
export type {
  SlashCommand, CommandContext, CommandKind, CommandSource, CommandCategory,
  Session, Config, ProviderRegistry, ProjectFs, McpRegistry,
  ShadowGit as ShadowGitInterface, ParsedArgs,
} from './commands/index.js';

// Context snapshots
export {
  SnapshotManager,
  createSnapshot,
  listSnapshots,
  loadSnapshot,
  restoreSnapshot,
  deleteSnapshot,
  searchSnapshots,
  cleanupSnapshots,
} from './snapshot.js';
export type { Snapshot, CreateSnapshotOptions } from './snapshot.js';

// Phase 7 — Plugin system
export { PluginManager } from './plugin-system.js';
export type { Plugin } from './plugin-system.js';

// Phase 8 — Agent system
export { AgentRegistry } from './agent-registry.js';
export type { AgentMode, AgentConfig, Agent } from './agent-system.js';

// Auto model routing
export { AutoModelRouter } from './auto-model.js';
export type { AutoModelConfig } from './auto-model.js';

// Sticky model overrides per agent
export { StickyModelManager } from './sticky-models.js';

// Per-agent custom instructions
export { loadAgentInstructions, loadAllAgentInstructions, AGENT_INSTRUCTIONS_DIR } from './agent-instructions.js';
export type { AgentInstructions } from './agent-instructions.js';

// Skills system
export { SkillManager, DEFAULT_SKILLS_DIRS } from './skills.js';
export type { SkillDef } from './skills.js';

// Reference resolution
export { ReferenceResolver } from './references.js';
export type { ResolvedReference } from './references.js';

// Formatter engine
export { FormatterEngine } from './formatter.js';
export { builtinFormatters } from './formatter-servers.js';
export type { FormatterDef } from './formatter-servers.js';
export type { FormatterConfig, FormatterResult, FormatterOverride } from './formatter.js';

// Variant cycling
export { VariantCycler } from './variant-cycler.js';
export type { Variant } from './variant-cycler.js';

// Notifications
export { NotificationManager, sendNotification } from './notifications.js';

// Image attachments
export { processAttachment, formatAsProviderMessage, hasVisionSupport, extractImageReferences } from './image-attachment.js';
export type { ImageAttachment } from './image-attachment.js';

// Usage statistics
export { StatsTracker } from './stats.js';
export type { UsageStats } from './stats.js';

// ACP (Agent Client Protocol)
export { ACPServer, createACPServer } from './acp-server.js';
export type { ACPRequest, ACPResponse, ACPOptions } from './acp-server.js';

// Policies system
export { evaluatePolicy } from './policies.js';
export type { PolicyStatement, PolicyConfig } from './policies.js';

// Custom commands via JSON config
export { loadCustomCommandsFromConfig } from './custom-commands.js';
export type { CustomCommandDef } from './custom-commands.js';

// Proxy & SSL configuration
export { loadProxyConfig, loadSSLConfig, createProxyAgent, createSSLOptions, proxiedFetch } from './proxy.js';
export type { ProxyConfig, SSLConfig } from './proxy.js';

// File watcher
export { FileWatcher } from './watcher.js';

// mDNS service discovery
export { publishService, discoverServices } from './mdns.js';
export type { PublishOptions, DiscoveredService } from './mdns.js';

// Cloud sync
export { CloudSyncService } from './cloud-sync.js';
export type { CloudSyncConfig, CloudSyncStatus } from './cloud-sync.js';

// Web search providers
export {
  WebSearchProvider,
  GoogleSearchProvider,
  BraveSearchProvider,
  BingSearchProvider,
  DuckDuckGoSearchProvider,
  TavilySearchProvider,
  Search1APIProvider,
  SearXNGProvider,
  detectSearchProvider,
} from './web-search-provider.js';
export type { SearchProviderType, SearchProviderConfig, SearchOptions, SearchResult, ISearchProvider } from './web-search-provider.js';

// Enterprise configuration (MDM, plist/registry, well-known discovery)
export { loadEnterpriseConfig, loadManagedConfig, validateAgainstEnterprise } from './enterprise-config.js';
export type { EnterpriseConfig, ValidationContext } from './enterprise-config.js';
export { fetchWellKnownConfig, parseWellKnownUrl } from './well-known.js';
export type { WellKnownConfig } from './well-known.js';

// IDE extension support
export { IDEProtocol, IDE_METHODS } from './ide-shared.js';
export type { IDEMessage } from './ide-shared.js';
export { generateVSCodeExtension } from './ide-vscode.js';
export type { VSCodeExtensionConfig } from './ide-vscode.js';
export { generateJetBrainsPlugin } from './ide-jetbrains.js';
export type { JetBrainsPluginConfig } from './ide-jetbrains.js';
export { generateNeovimPlugin } from './ide-neovim.js';
export type { NeovimPluginConfig } from './ide-neovim.js';

// GitHub Agent
export { GitHubAgent } from './github-agent.js';
export type {
  PRInfo, IssueInfo as GitHubIssueInfo, WorkflowInfo as GitHubWorkflowInfo,
  BranchInfo, CodeSearchResult as GitHubCodeSearchResult,
  CommentInfo, CommitInfo, RepoInfo as GitHubRepoInfo,
} from './github-agent.js';

// GitLab Agent
export { GitLabAgent } from './gitlab-agent.js';
export type {
  MRInfo, IssueInfo as GitLabIssueInfo,
  CodeSearchResult as GitLabCodeSearchResult,
  RepoInfo as GitLabRepoInfo,
} from './gitlab-agent.js';

// Daemon mode
export { SentinelDaemon, getDefaultDaemonConfig, isDaemonRunning, sendToDaemon } from './daemon.js';
export type { DaemonConfig } from './daemon.js';

// Remote relay (SSE-based session sharing)
export { SessionRelay } from './remote-relay.js';
export type { RelayConfig } from './remote-relay.js';

// MCP Marketplace
export { MCPMarketplace } from './mcp-marketplace.js';
export type { MCPMarketplaceEntry } from './mcp-marketplace.js';

// Worktree isolation
export { WorktreeManager } from './worktree.js';
export type { WorktreeConfig } from './worktree.js';

// Code Review (Feature 1)
export { createReviewPrompt, parseReviewOutput, getBranchDiff, createReviewSlashCommand } from './code-review.js';
export type { ReviewResult, ReviewOptions } from './code-review.js';

// PR Integration (Feature 2)
export { parsePRUrl, fetchPR, checkoutPR } from './pr-integration.js';
export type { PROptions, PRData } from './pr-integration.js';

// Roll-call (Feature 3)
export { runRollCall, summarizeRollCall } from './roll-call.js';
export type { RollCallResult, RollCallConfig } from './roll-call.js';

// Codebase Indexing (Feature 4)
export { CodebaseIndex } from './codebase-index.js';
export type { IndexedFile } from './codebase-index.js';

// Feature 4: Background Agents
export { AgentManager } from './agent-manager.js';
export type { AgentSpec, AgentHandle } from './agent-manager.js';

// Feature 1: Persistent Memory
export { PersistentMemory } from './persistent-memory.js';
export type { StoredEntry } from './persistent-memory.js';

// Feature 5: Voice Input
export {
  captureAndTranscribe, recordAudio,
  transcribeLocal, transcribeRemote,
  detectVoiceSupport,
} from './voice-input.js';
export type { VoiceConfig, TranscribeBackend } from './voice-input.js';
