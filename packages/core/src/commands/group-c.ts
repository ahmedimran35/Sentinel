import path from 'node:path';
import fs from 'node:fs';
import type { CommandContext, SlashCommand } from './types.js';
import { parseArgs } from './types.js';
import { runTurn } from '../run-turn.js';
import { AlwaysAllowGate } from '../permission-gate.js';
import { createProvider } from './provider-factory.js';

function cmd(def: Omit<SlashCommand, 'source' | 'kind'>): SlashCommand {
  return { ...def, kind: 'prompt', source: 'core' } as SlashCommand;
}

async function runPrompt(
  ctx: CommandContext,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const current = ctx.providers.getCurrent();
  const provider = await createProvider(current.provider, current.model);

  const turnId = `cmd-${Date.now().toString(36)}`;
  let collected = '';

  const stream = runTurn({
    turnId,
    config: { maxTurns: 1, timeoutMs: 60_000 },
    systemPrompt,
    history: [{ role: 'user', content: userMessage }],
    tools: [],
    provider,
    gate: new AlwaysAllowGate(),
    signal: ctx.signal,
  });

  for await (const event of stream) {
    if (event.type === 'text_delta') {
      collected += event.delta;
    }
    if (event.type === 'error') {
      collected += `\n[Error: ${event.message}]`;
    }
  }

  return collected;
}

async function init(ctx: CommandContext, _rawArgs: string): Promise<void> {
  const { analyzeRepo, generateAgentsMd } = await import('../agents-init.js');
  const analysis = await analyzeRepo(ctx.config.projectRoot);
  const content = generateAgentsMd(analysis, ctx.config.projectRoot);
  const agentsPath = path.resolve(ctx.config.projectRoot, 'AGENTS.md');
  await ctx.fs.write(agentsPath, content);
  ctx.log(`Generated AGENTS.md at ${agentsPath}`);
}

async function review(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const ref = args.positional[0] ?? 'HEAD';
  const { spawnSync } = await import('node:child_process');
  let diff = '';
  try {
    if (ref === 'working') {
      const result = spawnSync('git', ['diff'], { cwd: ctx.config.projectRoot, encoding: 'utf-8', timeout: 10_000 });
      diff = result.stdout ?? '';
    } else {
      const result = spawnSync('git', ['diff', ref], { cwd: ctx.config.projectRoot, encoding: 'utf-8', timeout: 10_000 });
      diff = result.stdout ?? '';
    }
  } catch {
    ctx.log('No diff available or not a git repository.');
    return;
  }
  if (!diff.trim()) { ctx.log('No changes to review.'); return; }

  const result = await runPrompt(
    ctx,
    'You are a code reviewer. Review the following diff and provide structured findings grouped by severity (blocker/major/minor/nit). For each finding, include the file, line number, issue description, and suggested fix. Do not make any changes.',
    `Please review this diff:\n\n${diff.slice(0, 8000)}`,
  );
  ctx.log(result);
}

async function plan(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const task = args.raw;
  if (!task) { ctx.log('Usage: /plan <task>'); return; }

  const result = await runPrompt(
    ctx,
    'You are an AI planning assistant. Create a step-by-step plan with success criteria for the given task. Do NOT implement anything — only produce a plan.',
    task,
  );
  ctx.log(result);
}

async function orchestrate(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const task = args.raw;
  if (!task) { ctx.log('Usage: /orchestrate <task>'); return; }

  const { Orchestrator } = await import('../orchestrator.js');
  const current = ctx.providers.getCurrent();
  const provider = await createProvider(current.provider, current.model);

  const orch = new Orchestrator(provider, provider, provider, [], ctx.signal);
  const result = await orch.run(task);
  ctx.log(result.summary + '\n' + result.steps.map((s) => `  [${s.status}] ${s.description}`).join('\n'));
}

async function agents(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const sub = args.positional[0] ?? 'list';

  if (sub === 'list') {
    ctx.log('Subagent definitions:\n  Built-in: general-purpose\n  Add agents to .sentinel/agents/*.md');
    return;
  }
  if (sub === 'enable' && args.positional[1]) {
    ctx.log(`Enabled agent: ${args.positional[1]}`);
    return;
  }
  if (sub === 'disable' && args.positional[1]) {
    ctx.log(`Disabled agent: ${args.positional[1]}`);
    return;
  }
  ctx.log('Usage: /agents [list|enable <name>|disable <name>|config <name>]');
}

async function goal(ctx: CommandContext, _rawArgs: string): Promise<void> {
  const lastMessages = ctx.session.history.slice(-10).map((m) => `${m.role}: ${(m.content ?? '').slice(0, 200)}`).join('\n');
  const result = await runPrompt(
    ctx,
    'You are evaluating progress toward the stated goal. Analyze the conversation so far and report: what is done, what is missing, and your confidence level (0-100%). Be honest about gaps.',
    `Recent conversation:\n\n${lastMessages}`,
  );
  ctx.log(result);
}

async function skills(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const sub = args.positional[0] ?? 'list';

  if (sub === 'list') {
    const skillsDir = path.resolve(ctx.config.projectRoot, '.sentinel/skills');
    let skillFiles: string[] = [];
    try {
      skillFiles = fs.readdirSync(skillsDir).filter((f) => f.endsWith('.md'));
    } catch { /* no skills dir */ }
    ctx.log(`Skills:\n${skillFiles.map((f) => `  ${f.replace('.md', '')}`).join('\n') || '  (none)\nAdd skills to .sentinel/skills/*.md'}`);
    return;
  }
  if (sub === 'run' && args.positional[1]) {
    const skillName = args.positional[1];
    const skillArgs = args.positional.slice(2).join(' ') || args.raw.replace(/^run\s+\S+\s*/, '');
    ctx.log(`Running skill: ${skillName} with args: "${skillArgs}"`);
    return;
  }
  ctx.log('Usage: /skills [list|run <name> [args]]');
}

async function recipe(ctx: CommandContext, rawArgs: string): Promise<void> {
  const args = parseArgs(rawArgs);
  const sub = args.positional[0] ?? 'save';

  if (sub === 'save') {
    const outPath = args.positional[1] ?? 'sentinel-recipe.md';
    const recipeLines = ctx.session.history.map((m) => {
      if (m.role === 'user') return `## User\n${m.content ?? ''}`;
      if (m.role === 'assistant') return `## Assistant\n${m.content ?? ''}`;
      return '';
    }).filter(Boolean);
    const recipePath = path.resolve(ctx.config.projectRoot, outPath);
    fs.writeFileSync(recipePath, recipeLines.join('\n\n'), 'utf-8');
    ctx.log(`Recipe saved to ${recipePath}`);
    return;
  }
  ctx.log('Usage: /recipe save [path]');
}

export const groupCCommands: SlashCommand[] = [
  cmd({ name: 'init', summary: 'Analyze repo and generate/refresh AGENTS.md', usage: '/init', category: 'project', run: init }),
  cmd({ name: 'review', aliases: ['code-review'], summary: 'Review working-tree diff or a git ref', usage: '/review [<git-ref>|working]', argHint: 'git-ref', category: 'project', run: review }),
  cmd({ name: 'plan', summary: 'Produce a step-by-step plan (no implementation)', usage: '/plan <task>', argHint: 'task description', category: 'agent', run: plan }),
  cmd({ name: 'orchestrate', summary: 'Run Planner→Coder→Verifier pipeline', usage: '/orchestrate <task>', argHint: 'task description', category: 'agent', run: orchestrate }),
  cmd({ name: 'agents', summary: 'Manage subagent definitions', usage: '/agents [list|enable <name>|disable <name>|config <name>]', argHint: 'list|enable|disable', category: 'agent', run: agents }),
  cmd({ name: 'goal', summary: 'Self-evaluate progress vs stated goal', usage: '/goal', category: 'agent', run: goal }),
  cmd({ name: 'skills', summary: 'List/run parameterized prompt files', usage: '/skills [list|run <name> [args]]', argHint: 'list|run', category: 'extend', run: skills }),
  cmd({ name: 'recipe', summary: 'Export current session as reusable recipe', usage: '/recipe save [path]', argHint: 'path', category: 'extend', run: recipe }),
];
