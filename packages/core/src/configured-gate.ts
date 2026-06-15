import type { SentinelEvent } from '@sentinel/shared';
import type { Mode } from './modes.js';
import { checkModePermission } from './modes.js';
import { analyzeBashCommand } from './bash-analyzer.js';
import { FilesystemJail } from './filesystem-jail.js';
import path from 'node:path';

export interface PermissionRule {
  allow: string[];
  deny: string[];
}

export interface GateConfig {
  mode: Mode;
  rules: PermissionRule;
  projectRoot: string;
  allowOutsideRoot: boolean;
  allowedExternalDirs?: string[];
}

export class ConfiguredGate {
  private emit: (event: SentinelEvent) => void;
  private jail: FilesystemJail;
  private config: GateConfig;
  private doomState = new Map<string, { count: number; firstSeen: number }>();

  constructor(config: GateConfig, emit: (event: SentinelEvent) => void) {
    this.config = { allowedExternalDirs: [], ...config };
    this.emit = emit;
    this.jail = new FilesystemJail(config.projectRoot, config.allowOutsideRoot);
  }

  private cleanupDoomLoop(): void {
    const now = Date.now();
    for (const [key, value] of this.doomState) {
      if (now - value.firstSeen > 30_000) {
        this.doomState.delete(key);
      }
    }
  }

  async request(
    turnId: string,
    action: string,
    risk: 'read' | 'write' | 'execute' | 'network',
  ): Promise<'approved' | 'denied' | 'pending'> {
    if ((risk === 'read' || risk === 'write') && /\.env/i.test(action)) {
      this.emit({
        type: 'awaiting_permission',
        turnId,
        action,
        risk: 'BLOCKED: .env file access denied',
      });
      return 'denied';
    }

    this.cleanupDoomLoop();
    const normalized = action.trim().toLowerCase();
    const entry = this.doomState.get(normalized) ?? { count: 0, firstSeen: Date.now() };
    entry.count++;
    this.doomState.set(normalized, entry);
    if (entry.count >= 5) {
      this.emit({
        type: 'awaiting_permission',
        turnId,
        action,
        risk: `DOOM_LOOP: Repeated action ${entry.count} times`,
      });
      return 'denied';
    }

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

    if (this.config.allowedExternalDirs && this.config.allowedExternalDirs.length > 0) {
      const pathRegex = /['"]([^'"]+)['"]/g;
      let match: RegExpExecArray | null;
      while ((match = pathRegex.exec(action)) !== null) {
        const filePath = match[1];
        if (!filePath) continue;
        const resolved = path.resolve(this.config.projectRoot, filePath);
        const relative = path.relative(this.config.projectRoot, resolved);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          const inAllowed = this.config.allowedExternalDirs.some(dir => {
            const allowedResolved = path.resolve(dir);
            const dirRelative = path.relative(allowedResolved, resolved);
            return !dirRelative.startsWith('..') && !path.isAbsolute(dirRelative);
          });
          if (!inAllowed) {
            this.emit({
              type: 'awaiting_permission',
              turnId,
              action,
              risk: `BLOCKED: Path ${filePath} not in allowed external directories`,
            });
            return 'denied';
          }
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
