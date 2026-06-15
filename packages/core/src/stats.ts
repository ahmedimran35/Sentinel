import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import type { SentinelEvent } from '@sentinel/shared';

export interface UsageStats {
  sessionsCount: number;
  totalTurns: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  totalCostUsd: number;
  totalErrors: number;
  totalToolCalls: number;
  startDate: string;
  lastActiveDate: string;
  modelsUsed: Record<string, number>;
  providersUsed: Record<string, number>;
  topCommands: Array<{ command: string; count: number }>;
}

const DEFAULT_PATH = join(homedir(), '.config', 'sentinel', 'stats.json');
const INPUT_COST_PER_TOKEN = 0.01 / 1000;
const OUTPUT_COST_PER_TOKEN = 0.03 / 1000;

export class StatsTracker {
  private stats: UsageStats;
  private activeTurns: Map<string, { model: string; provider: string }> = new Map();
  private commandCounts: Map<string, number> = new Map();

  constructor(private filePath?: string) {
    this.stats = StatsTracker.emptyStats();
    this.tryAutoLoad();
  }

  private static emptyStats(): UsageStats {
    return {
      sessionsCount: 1,
      totalTurns: 0,
      totalTokensInput: 0,
      totalTokensOutput: 0,
      totalCostUsd: 0,
      totalErrors: 0,
      totalToolCalls: 0,
      startDate: new Date().toISOString(),
      lastActiveDate: new Date().toISOString(),
      modelsUsed: {},
      providersUsed: {},
      topCommands: [],
    };
  }

  private tryAutoLoad(): void {
    const targetPath = this.filePath ?? DEFAULT_PATH;
    try {
      if (existsSync(targetPath)) {
        const raw = readFileSync(targetPath, 'utf-8');
        const parsed = JSON.parse(raw) as UsageStats;
        this.stats = {
          ...parsed,
          sessionsCount: parsed.sessionsCount + 1,
          startDate: new Date().toISOString(),
        };
        for (const cmd of this.stats.topCommands) {
          this.commandCounts.set(cmd.command, cmd.count);
        }
      }
    } catch {
      // ignore load errors
    }
  }

  trackEvent(event: SentinelEvent, metadata?: Record<string, unknown>): void {
    this.stats.lastActiveDate = new Date().toISOString();

    switch (event.type) {
      case 'turn_start': {
        this.stats.totalTurns++;
        const model = metadata?.model as string | undefined;
        const provider = metadata?.provider as string | undefined;
        if (model) {
          this.stats.modelsUsed[model] = (this.stats.modelsUsed[model] || 0) + 1;
        }
        if (provider) {
          this.stats.providersUsed[provider] = (this.stats.providersUsed[provider] || 0) + 1;
        }
        if (model && provider) {
          this.activeTurns.set(event.turnId, { model, provider });
        }
        break;
      }
      case 'turn_end': {
        if (event.usage) {
          const input = event.usage.input;
          const output = event.usage.output;
          this.stats.totalTokensInput += input;
          this.stats.totalTokensOutput += output;
          this.stats.totalCostUsd += input * INPUT_COST_PER_TOKEN + output * OUTPUT_COST_PER_TOKEN;
        }
        this.activeTurns.delete(event.turnId);
        break;
      }
      case 'tool_call_start':
        this.stats.totalToolCalls++;
        break;
      case 'error':
        this.stats.totalErrors++;
        break;
    }
  }

  trackTurnStart(turnId: string, model: string, provider: string): void {
    this.stats.lastActiveDate = new Date().toISOString();
    this.stats.totalTurns++;
    this.stats.modelsUsed[model] = (this.stats.modelsUsed[model] || 0) + 1;
    this.stats.providersUsed[provider] = (this.stats.providersUsed[provider] || 0) + 1;
    this.activeTurns.set(turnId, { model, provider });
  }

  trackTurnEnd(turnId: string, usage: { input: number; output: number; cacheRead?: number }): void {
    this.stats.lastActiveDate = new Date().toISOString();
    this.stats.totalTokensInput += usage.input;
    this.stats.totalTokensOutput += usage.output;
    this.stats.totalCostUsd +=
      usage.input * INPUT_COST_PER_TOKEN + usage.output * OUTPUT_COST_PER_TOKEN;
    this.activeTurns.delete(turnId);
  }

  trackToolCall(_toolName: string): void {
    this.stats.lastActiveDate = new Date().toISOString();
    this.stats.totalToolCalls++;
  }

  trackError(_message: string): void {
    this.stats.lastActiveDate = new Date().toISOString();
    this.stats.totalErrors++;
  }

  trackCommand(command: string): void {
    this.stats.lastActiveDate = new Date().toISOString();
    this.commandCounts.set(command, (this.commandCounts.get(command) || 0) + 1);
    this.syncTopCommands();
  }

  getStats(): UsageStats {
    this.syncTopCommands();
    return { ...this.stats };
  }

  reset(): void {
    this.stats = StatsTracker.emptyStats();
    this.activeTurns.clear();
    this.commandCounts.clear();
  }

  save(filePath?: string): void {
    const targetPath = filePath ?? this.filePath ?? DEFAULT_PATH;
    const dir = dirname(targetPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(targetPath, JSON.stringify(this.toJSON(), null, 2), 'utf-8');
  }

  load(filePath?: string): void {
    const targetPath = filePath ?? this.filePath ?? DEFAULT_PATH;
    if (!existsSync(targetPath)) return;
    const raw = readFileSync(targetPath, 'utf-8');
    const parsed = JSON.parse(raw) as UsageStats;
    this.stats = parsed;
    this.commandCounts.clear();
    for (const cmd of parsed.topCommands) {
      this.commandCounts.set(cmd.command, cmd.count);
    }
  }

  toJSON(): UsageStats {
    this.syncTopCommands();
    return { ...this.stats };
  }

  private syncTopCommands(): void {
    this.stats.topCommands = Array.from(this.commandCounts.entries())
      .map(([command, count]) => ({ command, count }))
      .sort((a, b) => b.count - a.count);
  }
}
