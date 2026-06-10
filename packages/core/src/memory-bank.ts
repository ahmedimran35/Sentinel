import fs from 'node:fs/promises';
import path from 'node:path';

const MEMORY_DIR = '.sentinel/memory';
const MEMORY_FILES = ['architecture.md', 'decisions.md', 'conventions.md'];

export class MemoryBank {
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(path.join(this.rootDir, MEMORY_DIR), { recursive: true });
  }

  async readAll(): Promise<string> {
    await this.ensureDir();
    let content = '# Memory Bank\n\n';

    for (const file of MEMORY_FILES) {
      try {
        const fileContent = await fs.readFile(path.join(this.rootDir, MEMORY_DIR, file), 'utf-8');
        content += `## ${file.replace('.md', '')}\n\n${fileContent}\n\n`;
      } catch {
        content += `## ${file.replace('.md', '')}\n\n*(empty)*\n\n`;
      }
    }

    return content;
  }

  async write(filename: string, content: string): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(path.join(this.rootDir, MEMORY_DIR, filename), content, 'utf-8');
  }

  async append(filename: string, content: string): Promise<void> {
    await this.ensureDir();
    const filePath = path.join(this.rootDir, MEMORY_DIR, filename);
    let existing = '';
    try { existing = await fs.readFile(filePath, 'utf-8'); } catch { /* new file */ }
    await fs.writeFile(filePath, existing + '\n' + content, 'utf-8');
  }
}
