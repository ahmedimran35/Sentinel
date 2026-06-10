export interface CostEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

export class CostTracker {
  private entries: CostEntry[] = [];
  private totalCost = 0;

  add(entry: Omit<CostEntry, 'totalCost'>): void {
    const totalCost = entry.inputCost + entry.outputCost;
    this.entries.push({ ...entry, totalCost });
    this.totalCost += totalCost;
  }

  getTotalCost(): number {
    return this.totalCost;
  }

  getEntries(): readonly CostEntry[] {
    return this.entries;
  }

  reset(): void {
    this.entries = [];
    this.totalCost = 0;
  }
}

export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  inputRate: number,
  outputRate: number,
): { inputCost: number; outputCost: number } {
  return {
    inputCost: (inputTokens / 1_000) * inputRate,
    outputCost: (outputTokens / 1_000) * outputRate,
  };
}
