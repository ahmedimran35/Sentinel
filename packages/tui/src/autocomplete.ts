export interface AutocompleteConfig {
  enabled: boolean;
  debounceMs: number;
  provider: string;
  maxLines: number;
  triggerChars: string;
}

export const DEFAULT_AUTOCOMPLETE_CONFIG: AutocompleteConfig = {
  enabled: false,
  debounceMs: 300,
  provider: 'codestral',
  maxLines: 5,
  triggerChars: ' .\n\t(',
};

type FetchFn = (prefix: string, suffix: string) => Promise<string | null>;

export class AutocompleteEngine {
  private config: AutocompleteConfig;
  private suggestion: string | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private fetchFn: FetchFn | null = null;

  constructor(config?: Partial<AutocompleteConfig>) {
    this.config = { ...DEFAULT_AUTOCOMPLETE_CONFIG, ...config };
  }

  setFetchFn(fn: FetchFn): void {
    this.fetchFn = fn;
  }

  async suggest(input: string, cursorPos: number, _fileContext?: string): Promise<string | null> {
    if (!this.config.enabled || !this.fetchFn) {
      this.suggestion = null;
      return null;
    }

    const prefix = input.slice(0, cursorPos);
    const suffix = input.slice(cursorPos);

    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    return new Promise<string | null>((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        try {
          const result = await this.fetchFn!(prefix, suffix);
          this.suggestion = result;
          resolve(result);
        } catch {
          this.suggestion = null;
          resolve(null);
        }
      }, this.config.debounceMs);
    });
  }

  accept(): string {
    const s = this.suggestion;
    this.suggestion = null;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    return s ?? '';
  }

  reject(): void {
    this.suggestion = null;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  getCurrentSuggestion(): string | null {
    return this.suggestion;
  }

  setConfig(config: Partial<AutocompleteConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
