export interface TokenCounter {
  (text: string): number;
}

export interface CompactionResult {
  summary: string;
  pruned: number;
  kept: number;
}

export class ContextManager {
  private tokenCount = 0;
  private messages: Array<{ role: string; content: string; tokens: number }> = [];
  constructor(
    private maxTokens: number,
    private countTokens: TokenCounter,
    private compactRatio = 0.9,
  ) {}

  addMessage(role: string, content: string): void {
    const tokens = this.countTokens(content);
    this.messages.push({ role, content, tokens });
    this.tokenCount += tokens;
  }

  getUsage(): { used: number; max: number; ratio: number } {
    return {
      used: this.tokenCount,
      max: this.maxTokens,
      ratio: this.tokenCount / this.maxTokens,
    };
  }

  shouldCompact(): boolean {
    return this.tokenCount / this.maxTokens >= this.compactRatio;
  }

  compact(): CompactionResult {
    if (this.messages.length <= 4) {
      return { summary: '', pruned: 0, kept: this.messages.length };
    }

    const systemMessages = this.messages.filter((m) => m.role === 'system');
    const userMessages = this.messages.filter((m) => m.role === 'user');
    const toolMessages = this.messages.filter((m) => m.role === 'tool');

    const toPrune = toolMessages.slice(0, Math.floor(toolMessages.length * 0.6));
    const pruned = toPrune.length;

    const keptToolResults = toolMessages.slice(toPrune.length);
    const lastAssistantMsg = this.messages.filter((m) => m.role === 'assistant').slice(-5);

    const kept = [
      ...systemMessages,
      ...lastAssistantMsg,
      ...userMessages.slice(-3),
      ...keptToolResults.slice(-3),
    ];

    const summary = [
      `Context compacted at ${this.tokenCount} tokens (${Math.round(this.tokenCount / this.maxTokens * 100)}% of ${this.maxTokens}).`,
      `Pruned ${pruned} old tool results. Keeping last ${kept.length} messages.`,
    ].join('\n');

    this.messages = kept;
    this.tokenCount = kept.reduce((sum, m) => sum + m.tokens, 0);
    return { summary, pruned, kept: kept.length };
  }

  getMessages(): Array<{ role: string; content: string }> {
    return this.messages.map((m) => ({ role: m.role, content: m.content }));
  }

  clear(): void {
    this.messages = [];
    this.tokenCount = 0;
  }
}
