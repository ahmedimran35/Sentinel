import { readFile, access } from 'node:fs/promises';
import { readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const AGENT_INSTRUCTIONS_DIR = '.sentinel/agents';

export interface AgentInstructions {
  agentName: string;
  instructions: string;
  loadedFrom: string;
}

function findProjectRoot(projectRoot?: string): string {
  return projectRoot ? resolve(projectRoot) : process.cwd();
}

function instructionsPath(root: string, agentName: string): string {
  return join(root, AGENT_INSTRUCTIONS_DIR, agentName, 'instructions.md');
}

function defaultInstructionsPath(root: string): string {
  return join(root, AGENT_INSTRUCTIONS_DIR, 'default', 'instructions.md');
}

/**
 * Load instructions for a specific agent.
 * Falls back to .sentinel/agents/default/instructions.md if the agent-specific file does not exist.
 * Returns null if no instructions file is found.
 */
export async function loadAgentInstructions(
  agentName: string,
  projectRoot?: string,
): Promise<AgentInstructions | null> {
  const root = findProjectRoot(projectRoot);

  const paths = [
    { path: instructionsPath(root, agentName), name: agentName },
    { path: defaultInstructionsPath(root), name: agentName },
  ];

  for (const { path, name } of paths) {
    try {
      await access(path);
      const instructions = await readFile(path, 'utf-8');
      return { agentName: name, instructions, loadedFrom: path };
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Load instructions for all agents that have instructions files in .sentinel/agents/.
 */
export async function loadAllAgentInstructions(
  projectRoot?: string,
): Promise<AgentInstructions[]> {
  const root = findProjectRoot(projectRoot);
  const agentsDir = join(root, AGENT_INSTRUCTIONS_DIR);

  if (!existsSync(agentsDir)) return [];

  const entries = readdirSync(agentsDir, { withFileTypes: true });
  const results: AgentInstructions[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'default') continue;
    const result = await loadAgentInstructions(entry.name, root);
    if (result) {
      results.push(result);
    }
  }

  return results;
}
