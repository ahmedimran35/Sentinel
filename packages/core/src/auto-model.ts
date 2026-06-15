export interface AutoModelConfig {
  enabled: boolean;
  cheapModel: string;
  smartModel: string;
  threshold: number;
}

export class AutoModelRouter {
  private config: AutoModelConfig;

  constructor(config: AutoModelConfig) {
    this.config = config;
  }

  /**
   * Classify task complexity on a 0-1 scale based on length, code blocks, and special characters.
   */
  classifyComplexity(task: string): number {
    let score = 0;

    const length = task.length;
    if (length > 500) score += 0.3;
    else if (length > 200) score += 0.2;
    else if (length > 100) score += 0.1;

    const codeBlockCount = (task.match(/```/g) ?? []).length / 2;
    score += Math.min(codeBlockCount * 0.15, 0.45);

    const specialCharRatio = (task.match(/[^a-zA-Z0-9\s]/g) ?? []).length / Math.max(length, 1);
    if (specialCharRatio > 0.3) score += 0.15;
    else if (specialCharRatio > 0.15) score += 0.1;

    const keywords = ['refactor', 'architecture', 'optimize', 'security', 'deploy', 'complex', 'bug'];
    const keywordHits = keywords.filter(k => task.toLowerCase().includes(k)).length;
    score += keywordHits * 0.05;

    return Math.min(score, 1);
  }

  /**
   * Select the appropriate model based on task complexity and threshold.
   * Returns the smart model if complexity exceeds threshold or if the task contains code blocks.
   */
  selectModel(task: string, complexityHint?: number): string {
    if (!this.config.enabled) return this.config.smartModel;

    const complexity = complexityHint ?? this.classifyComplexity(task);
    const hasCodeBlocks = /```[\s\S]*```/.test(task);

    if (complexity > this.config.threshold || hasCodeBlocks) {
      return this.config.smartModel;
    }

    return this.config.cheapModel;
  }
}
