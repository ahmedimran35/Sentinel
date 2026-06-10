export { EventBus } from './event-bus.js';
export { runTurn } from './run-turn.js';
export { MockProvider } from './mock-provider.js';
export { AlwaysAllowGate, EmittingGate } from './permission-gate.js';
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
