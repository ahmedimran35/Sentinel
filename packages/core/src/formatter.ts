import { execFile, spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';
import { builtinFormatters, type FormatterDef } from './formatter-servers.js';

const WHICH_CMD = process.platform === 'win32' ? 'where' : 'which';

export interface FormatterResult {
  formatted: boolean;
  output?: string;
  error?: string;
  formatter?: string;
}

export interface FormatterOverride {
  extensions?: string[];
  command?: string[];
  requirements?: string[];
  configFiles?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
}

export interface FormatterConfig {
  extensions: string[];
  command: string;
  args: string[];
}

export type { FormatterDef } from './formatter-servers.js';
export { builtinFormatters } from './formatter-servers.js';

export class FormatterEngine {
  private defs: FormatterDef[];
  private overrides: Record<string, FormatterOverride>;
  private resolved: FormatterDef[];
  private extMap: Map<string, FormatterDef>;

  constructor(
    defs?: FormatterDef[],
    overrides?: Record<string, FormatterOverride>,
  ) {
    if (defs && defs.length > 0 && !('name' in defs[0]!)) {
      const old = defs as unknown as FormatterConfig[];
      this.defs = old.map((c, _i) => ({
        name: c.command,
        extensions: c.extensions,
        command: [c.command, ...c.args],
      }));
    } else {
      this.defs = (defs as FormatterDef[]) ?? [...builtinFormatters];
    }
    this.overrides = overrides ?? {};
    this.resolved = [];
    this.extMap = new Map();
    this.resolveFormatters();
  }

  private resolveFormatters(): void {
    this.resolved = [];
    this.extMap = new Map();

    for (const def of this.defs) {
      const override = this.overrides[def.name];
      if (override?.disabled ?? def.disabled) continue;

      const merged: FormatterDef = {
        ...def,
        ...override,
        name: def.name,
      };

      this.resolved.push(merged);
      for (const ext of merged.extensions) {
        if (!this.extMap.has(ext)) {
          this.extMap.set(ext, merged);
        }
      }
    }
  }

  async formatFile(filePath: string): Promise<FormatterResult> {
    const ext = extname(filePath);
    const def = this.extMap.get(ext);
    if (!def) return { formatted: false };

    const available = await this.checkRequirements(def);
    if (!available) return { formatted: false };

    const cmd = def.command.map((part) => (part === '$FILE' ? filePath : part));
    const env = { ...process.env, ...def.env };

    return new Promise((resolve) => {
      const child = spawn(cmd[0]!, cmd.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000,
        env,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ formatted: true, output: stdout || undefined, formatter: def.name });
        } else {
          resolve({ formatted: false, output: stdout || undefined, error: stderr || `exit code ${code}`, formatter: def.name });
        }
      });

      child.on('error', (err: Error) => {
        resolve({ formatted: false, error: err.message, formatter: def.name });
      });
    });
  }

  async formatFiles(filePaths: string[]): Promise<Array<{ file: string } & FormatterResult>> {
    return Promise.all(
      filePaths.map(async (file) => {
        const result = await this.formatFile(file);
        return { file, ...result };
      }),
    );
  }

  async detectAvailableFormatters(): Promise<string[]> {
    const results = await Promise.all(
      this.resolved.map(async (def) => {
        const ok = await this.checkRequirements(def);
        return ok ? def.name : null;
      }),
    );
    return results.filter((r): r is string => r !== null);
  }

  setOverrides(overrides: Record<string, FormatterOverride>): void {
    this.overrides = overrides;
    this.resolveFormatters();
  }

  loadConfig(configPath?: string): void {
    if (!configPath) return;
    try {
      const data = readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        if (parsed.length > 0 && 'name' in parsed[0]) {
          this.defs = parsed as FormatterDef[];
        } else {
          const old = parsed as FormatterConfig[];
          this.defs = old.map((c, _i) => ({
            name: c.command,
            extensions: c.extensions,
            command: [c.command, ...c.args],
          }));
        }
        this.resolveFormatters();
      } else if (typeof parsed === 'object' && parsed !== null) {
        this.overrides = { ...this.overrides, ...parsed as Record<string, FormatterOverride> };
        this.resolveFormatters();
      }
    } catch {
      // keep existing config on parse failure
    }
  }

  private async checkRequirements(def: FormatterDef): Promise<boolean> {
    if (def.requirements && def.requirements.length > 0) {
      for (const req of def.requirements) {
        const available = await isToolAvailable(req);
        if (!available) return false;
      }
    }

    if (def.configFiles && def.configFiles.length > 0) {
      const anyExists = def.configFiles.some((f) => existsSync(f));
      if (!anyExists) return false;
    }

    return true;
  }
}

function isToolAvailable(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(WHICH_CMD, [command], (err) => {
      resolve(err === null);
    });
  });
}
