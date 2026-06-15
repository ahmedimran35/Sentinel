import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StatsTracker } from './stats.js';
import { mkdtempSync, unlinkSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('StatsTracker', () => {
  let tracker: StatsTracker;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sentinel-stats-'));
    tracker = new StatsTracker(join(tmpDir, 'stats.json'));
  });

  afterEach(() => {
    try { unlinkSync(join(tmpDir, 'stats.json')); } catch {}
    try { unlinkSync(join(tmpDir, 'other.json')); } catch {}
    try { unlinkSync(join(tmpDir, 'other2.json')); } catch {}
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('starts with empty stats', () => {
    const stats = tracker.getStats();
    expect(stats.sessionsCount).toBe(1);
    expect(stats.totalTurns).toBe(0);
    expect(stats.totalTokensInput).toBe(0);
    expect(stats.totalTokensOutput).toBe(0);
    expect(stats.totalCostUsd).toBe(0);
    expect(stats.totalErrors).toBe(0);
    expect(stats.totalToolCalls).toBe(0);
    expect(typeof stats.startDate).toBe('string');
    expect(typeof stats.lastActiveDate).toBe('string');
  });

  it('tracks turn start/end with counts and token usage', () => {
    tracker.trackTurnStart('turn-1', 'gpt-4', 'openai');
    tracker.trackTurnEnd('turn-1', { input: 100, output: 50 });

    const stats = tracker.getStats();
    expect(stats.totalTurns).toBe(1);
    expect(stats.totalTokensInput).toBe(100);
    expect(stats.totalTokensOutput).toBe(50);
    expect(stats.modelsUsed).toEqual({ 'gpt-4': 1 });
    expect(stats.providersUsed).toEqual({ openai: 1 });
  });

  it('tracks multiple turns aggregating tokens', () => {
    tracker.trackTurnStart('t1', 'gpt-4', 'openai');
    tracker.trackTurnEnd('t1', { input: 200, output: 100 });
    tracker.trackTurnStart('t2', 'claude-3', 'anthropic');
    tracker.trackTurnEnd('t2', { input: 300, output: 200 });

    const stats = tracker.getStats();
    expect(stats.totalTurns).toBe(2);
    expect(stats.totalTokensInput).toBe(500);
    expect(stats.totalTokensOutput).toBe(300);
    expect(stats.modelsUsed).toEqual({ 'gpt-4': 1, 'claude-3': 1 });
    expect(stats.providersUsed).toEqual({ openai: 1, anthropic: 1 });
  });

  it('tracks cost from token usage', () => {
    // $0.01 per 1K input = 0.00001 per token
    // $0.03 per 1K output = 0.00003 per token
    // 1000 input + 500 output = 0.01 + 0.015 = 0.025
    tracker.trackTurnStart('t1', 'gpt-4', 'openai');
    tracker.trackTurnEnd('t1', { input: 1000, output: 500 });

    expect(tracker.getStats().totalCostUsd).toBeCloseTo(0.025, 5);
  });

  it('tracks tool calls', () => {
    tracker.trackToolCall('read_file');
    tracker.trackToolCall('write_file');
    tracker.trackToolCall('read_file');

    expect(tracker.getStats().totalToolCalls).toBe(3);
  });

  it('tracks errors', () => {
    tracker.trackError('Something broke');
    tracker.trackError('Another error');

    expect(tracker.getStats().totalErrors).toBe(2);
  });

  it('tracks commands', () => {
    tracker.trackCommand('/help');
    tracker.trackCommand('/status');
    tracker.trackCommand('/help');

    const stats = tracker.getStats();
    expect(stats.topCommands).toEqual([
      { command: '/help', count: 2 },
      { command: '/status', count: 1 },
    ]);
  });

  it('tracks events via trackEvent (turn_start, turn_end, tool_call_start, error)', () => {
    tracker.trackEvent(
      { type: 'turn_start', turnId: 't1', config: { maxTurns: 10, timeoutMs: 60000 } },
      { model: 'gpt-4', provider: 'openai' },
    );
    tracker.trackEvent(
      { type: 'tool_call_start', turnId: 't1', call: { id: 'c1', name: 'read_file', args: {} } },
    );
    tracker.trackEvent(
      { type: 'tool_call_start', turnId: 't1', call: { id: 'c2', name: 'write_file', args: {} } },
    );
    tracker.trackEvent(
      { type: 'turn_end', turnId: 't1', usage: { input: 500, output: 250 } },
    );
    tracker.trackEvent(
      { type: 'error', turnId: 't1', message: 'fail', fatal: false },
    );

    const stats = tracker.getStats();
    expect(stats.totalTurns).toBe(1);
    expect(stats.totalToolCalls).toBe(2);
    expect(stats.totalErrors).toBe(1);
    expect(stats.totalTokensInput).toBe(500);
    expect(stats.totalTokensOutput).toBe(250);
    expect(stats.modelsUsed).toEqual({ 'gpt-4': 1 });
    expect(stats.providersUsed).toEqual({ openai: 1 });
  });

  it('resets all stats', () => {
    tracker.trackTurnStart('t1', 'gpt-4', 'openai');
    tracker.trackTurnEnd('t1', { input: 100, output: 50 });
    tracker.trackToolCall('read_file');
    tracker.trackError('err');
    tracker.trackCommand('/help');

    tracker.reset();

    const stats = tracker.getStats();
    expect(stats.sessionsCount).toBe(1);
    expect(stats.totalTurns).toBe(0);
    expect(stats.totalToolCalls).toBe(0);
    expect(stats.totalErrors).toBe(0);
    expect(stats.totalTokensInput).toBe(0);
    expect(stats.totalTokensOutput).toBe(0);
    expect(stats.totalCostUsd).toBe(0);
    expect(stats.topCommands).toEqual([]);
  });

  it('save/load roundtrip preserves data', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'sentinel-stats-'));
    const filePath = join(tmpDir, 'stats.json');

    tracker.trackTurnStart('t1', 'gpt-4', 'openai');
    tracker.trackTurnEnd('t1', { input: 500, output: 250 });
    tracker.trackToolCall('read_file');
    tracker.trackError('test error');
    tracker.trackCommand('/help');

    // Save first session data
    tracker.save(filePath);
    expect(existsSync(filePath)).toBe(true);

    // Create a new tracker, load the saved data, add more turns
    const loaded = new StatsTracker(join(tmpDir, 'other.json'));
    loaded.load(filePath);
    loaded.trackTurnStart('t2', 'claude-3', 'anthropic');
    loaded.trackTurnEnd('t2', { input: 100, output: 50 });
    loaded.trackToolCall('write_file');

    // Save the combined state
    loaded.save(filePath);

    // Load into fresh tracker and verify
    const fresh = new StatsTracker(join(tmpDir, 'other2.json'));
    fresh.load(filePath);

    const stats = fresh.getStats();
    expect(stats.totalTurns).toBe(2);
    expect(stats.totalTokensInput).toBe(600);
    expect(stats.totalTokensOutput).toBe(300);
    expect(stats.totalToolCalls).toBe(2);
    expect(stats.totalErrors).toBe(1);
    expect(stats.topCommands).toEqual([{ command: '/help', count: 1 }]);
    expect(stats.modelsUsed).toEqual({ 'gpt-4': 1, 'claude-3': 1 });
    expect(stats.providersUsed).toEqual({ openai: 1, anthropic: 1 });

    // Cleanup
    unlinkSync(filePath);
  });

  it('toJSON returns a snapshot not a reference', () => {
    const json = tracker.toJSON();
    json.totalTurns = 999;
    expect(tracker.getStats().totalTurns).toBe(0);
  });
});
