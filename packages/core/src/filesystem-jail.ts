import path from 'node:path';

export class FilesystemJail {
  constructor(
    private projectRoot: string,
    private allowOutsideRoot = false,
  ) {}

  resolve(requestedPath: string): { resolved: string; blocked: boolean; reason?: string } {
    const resolved = path.resolve(this.projectRoot, requestedPath);

    if (this.allowOutsideRoot) {
      return { resolved, blocked: false };
    }

    const relative = path.relative(this.projectRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return {
        resolved,
        blocked: true,
        reason: `Path ${requestedPath} is outside project root (${this.projectRoot}). Use --allow-outside-root to enable.`,
      };
    }

    return { resolved, blocked: false };
  }
}
