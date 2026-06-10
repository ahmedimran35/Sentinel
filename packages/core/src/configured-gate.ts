import type { SentinelEvent } from '@sentinel/shared';
import type { Mode } from './modes.js';
import { checkModePermission } from './modes.js';
import { analyzeBashCommand } from './bash-analyzer.js';
import { FilesystemJail } from './filesystem-jail.js';

export interface PermissionRule {
  allow: string[];
  deny: string[];
}

export interface GateConfig {
  mode: Mode;
  rules: PermissionRule;
  projectRoot: string;
  allowOutsideRoot: boolean;
}

export class ConfiguredGate {
  private emit: (event: SentinelEvent) => void;
  private jail: FilesystemJail;
  private config: GateConfig;

  constructor(config: GateConfig, emit: (event: SentinelEvent) => void) {
    this.config = config;
    this.emit = emit;
    this.jail = new FilesystemJail(config.projectRoot, config.allowOutsideRoot);
  }

  async request(
    turnId: string,
    action: string,
    risk: 'read' | 'write' | 'execute' | 'network',
  ): Promise<'approved' | 'denied' | 'pending'> {
    if (risk === 'read') return 'approved';

    if (!checkModePermission(this.config.mode, risk)) {
      this.emit({
        type: 'awaiting_permission',
        turnId,
        action,
        risk: `Blocked by ${this.config.mode.toUpperCase()} mode: ${risk} not allowed`,
      });
      return 'denied';
    }

    if (risk === 'execute') {
      const analysis = analyzeBashCommand(action);
      if (!analysis.safe) {
        this.emit({
          type: 'awaiting_permission',
          turnId,
          action,
          risk: `FLAGGED: ${analysis.flags.join(', ')}`,
        });
        return 'pending';
      }
    }

    if (risk === 'write' && action.includes('/')) {
      const pathMatch = action.match(/[./'"]([^'"\s]+)/);
      if (pathMatch) {
        const check = this.jail.resolve(pathMatch[1]!);
        if (check.blocked) {
          this.emit({
            type: 'awaiting_permission',
            turnId,
            action,
            risk: check.reason ?? 'Path outside project root',
          });
        }
      }
    }

    this.emit({
      type: 'awaiting_permission',
      turnId,
      action,
      risk: `${risk} action`,
    });

    return 'pending';
  }

  setMode(mode: Mode): void {
    this.config.mode = mode;
  }

  getMode(): Mode {
    return this.config.mode;
  }
}
