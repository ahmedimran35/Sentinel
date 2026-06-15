import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export interface RepoAnalysis {
  languages: string[];
  frameworks: string[];
  buildTools: string[];
  testFramework: string;
  packageManager: string;
  conventions: string[];
}

export async function analyzeRepo(rootDir: string): Promise<RepoAnalysis> {
  const analysis: RepoAnalysis = {
    languages: [],
    frameworks: [],
    buildTools: [],
    testFramework: 'unknown',
    packageManager: 'unknown',
    conventions: [],
  };

  const files = await discoverFiles(rootDir);

  for (const file of files) {
    const basename = path.basename(file);

    if (basename === 'package.json') {
      analysis.languages.push('TypeScript/JavaScript');
      try {
        const content = JSON.parse(await fs.readFile(file, 'utf-8'));
        if (content.scripts?.test) {
          const testCmd = content.scripts.test;
          if (testCmd.includes('vitest')) analysis.testFramework = 'vitest';
          else if (testCmd.includes('jest')) analysis.testFramework = 'jest';
          else if (testCmd.includes('mocha')) analysis.testFramework = 'mocha';
          else if (testCmd.includes('ava')) analysis.testFramework = 'ava';
        }
        if (content.devDependencies?.vitest || content.dependencies?.vitest) analysis.testFramework = 'vitest';
        if (content.devDependencies?.jest || content.dependencies?.jest) analysis.testFramework = 'jest';

        if (content.scripts?.build) {
          const buildCmd = content.scripts.build;
          if (buildCmd.includes('tsc')) analysis.buildTools.push('tsc');
          if (buildCmd.includes('vite')) analysis.buildTools.push('vite');
          if (buildCmd.includes('webpack')) analysis.buildTools.push('webpack');
          if (buildCmd.includes('esbuild')) analysis.buildTools.push('esbuild');
          if (buildCmd.includes('next')) analysis.frameworks.push('Next.js');
        }
      } catch { /* ignore */ }

      if (await fileExists(path.join(rootDir, 'pnpm-lock.yaml'))) analysis.packageManager = 'pnpm';
      else if (await fileExists(path.join(rootDir, 'yarn.lock'))) analysis.packageManager = 'yarn';
      else if (await fileExists(path.join(rootDir, 'package-lock.json'))) analysis.packageManager = 'npm';
    }

    if (basename === 'Cargo.toml') {
      analysis.languages.push('Rust');
      analysis.buildTools.push('cargo');
      try {
        const content = await fs.readFile(file, 'utf-8');
        if (content.includes('actix')) analysis.frameworks.push('Actix');
        if (content.includes('axum')) analysis.frameworks.push('Axum');
        if (content.includes('rocket')) analysis.frameworks.push('Rocket');
        if (content.includes('tokio')) analysis.conventions.push('async/await with tokio');
      } catch { /* ignore */ }
    }

    if (basename === 'go.mod') {
      analysis.languages.push('Go');
      analysis.buildTools.push('go');
    }

    if (basename === 'pyproject.toml' || basename === 'requirements.txt') {
      analysis.languages.push('Python');
      if (await fileExists(path.join(rootDir, 'pyproject.toml'))) analysis.buildTools.push('poetry');
    }

    if (basename.endsWith('.rs')) { if (!analysis.languages.includes('Rust')) analysis.languages.push('Rust'); }
    if (basename.endsWith('.go')) { if (!analysis.languages.includes('Go')) analysis.languages.push('Go'); }
    if (basename.endsWith('.py')) { if (!analysis.languages.includes('Python')) analysis.languages.push('Python'); }
    if (basename.endsWith('.ts') || basename.endsWith('.tsx')) { if (!analysis.languages.includes('TypeScript/JavaScript')) analysis.languages.push('TypeScript/JavaScript'); }

    if (basename === 'Dockerfile') analysis.conventions.push('Docker containerized');
    if (basename === 'docker-compose.yml' || basename === 'docker-compose.yaml') analysis.conventions.push('Docker Compose orchestration');
  }

  if (analysis.languages.length === 0) analysis.languages.push('Unknown');

  return analysis;
}

export function generateAgentsMd(analysis: RepoAnalysis, rootDir: string): string {
  const projectName = path.basename(rootDir);

  return `# ${projectName} — AGENTS.md

## Project Overview
${projectName} is a ${analysis.languages.join('/')} project.

## Languages & Frameworks
- Languages: ${analysis.languages.join(', ')}
- Frameworks: ${analysis.frameworks.length > 0 ? analysis.frameworks.join(', ') : 'None detected'}
- Build tools: ${analysis.buildTools.length > 0 ? analysis.buildTools.join(', ') : 'None detected'}
- Package manager: ${analysis.packageManager}
- Test framework: ${analysis.testFramework}

## Conventions
${analysis.conventions.length > 0 ? analysis.conventions.map((c) => `- ${c}`).join('\n') : '- Follow language-standard conventions'}

## Commands
- Build: \`${analysis.buildTools.length > 0 ? analysis.buildTools[0] + ' build' : 'npm run build'}\`
- Test: \`npm run test\`${analysis.testFramework === 'vitest' ? ' (or specific package: pnpm --filter <package> test)' : ''}
- Lint: \`npm run lint\`
- Typecheck: \`npm run typecheck\`

## Guidelines
- Write tests for all new functionality
- Follow existing code style (Explicit types, no \`any\`)
- Keep functions small and pure where possible
- Use the existing error handling patterns
`;
}

export async function initAgentsMd(rootDir: string): Promise<string> {
  const analysis = await analyzeRepo(rootDir);
  const content = generateAgentsMd(analysis, rootDir);
  const agentsPath = path.join(rootDir, 'AGENTS.md');
  await fs.writeFile(agentsPath, content, 'utf-8');
  return agentsPath;
}

async function discoverFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const result = spawnSync('find', [rootDir, '-maxdepth', '3', '-type', 'f'], {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: 'pipe',
      stderr: 'ignore',
    });
    for (const file of (result.stdout ?? '').trim().split('\n').filter(Boolean).slice(0, 500)) {
      if (!file.includes('node_modules') && !file.includes('.git/')) {
        files.push(file);
      }
    }
  } catch { /* ignore */ }
  return files;
}

async function fileExists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; } catch { return false; }
}

export async function loadGlobalAgentsMd(): Promise<string | null> {
  const candidates = [
    path.join(process.env.HOME || '/tmp', '.config', 'sentinel', 'AGENTS.md'),
    path.join(process.env.HOME || '/tmp', '.config', 'opencode', 'AGENTS.md'),
    path.join(process.env.HOME || '/tmp', '.claude', 'CLAUDE.md'),
  ];
  if (process.env.OPENCODE_DISABLE_CLAUDE_CODE) {
    return null;
  }
  if (process.env.OPENCODE_DISABLE_CLAUDE_CODE_PROMPT) {
    return null;
  }
  for (const fp of candidates) {
    try {
      const content = await fs.readFile(fp, 'utf-8');
      if (content.trim()) return content;
    } catch { /* not found */ }
  }
  return null;
}

export async function loadInstructionFiles(
  instructions: string[],
  projectRoot: string,
): Promise<string[]> {
  const results: string[] = [];
  for (const entry of instructions) {
    try {
      if (entry.startsWith('http://') || entry.startsWith('https://')) {
        const res = await fetch(entry);
        if (res.ok) results.push(await res.text());
      } else {
        const fp = path.isAbsolute(entry)
          ? entry
          : path.join(projectRoot, entry);
        const content = await fs.readFile(fp, 'utf-8');
        if (content.trim()) results.push(content);
      }
    } catch { /* skip unreadable */ }
  }
  return results;
}
