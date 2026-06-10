import type { SentinelEvent, Tool, TurnConfig } from '@sentinel/shared';
import type { Provider, ProviderMessage } from '@sentinel/providers';
import type { PermissionGate } from './permission-gate.js';

export interface OrchestratorStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  output?: string;
}

export interface OrchestrationResult {
  success: boolean;
  steps: OrchestratorStep[];
  summary: string;
}

export class Orchestrator {
  constructor(
    private plannerProvider: Provider,
    private coderProvider: Provider,
    private verifierProvider: Provider,
    private tools: Tool[],
    private gate: PermissionGate,
    private signal: AbortSignal,
  ) {}

  async run(task: string): Promise<OrchestrationResult> {
    const steps: OrchestratorStep[] = [];
    const plan = await this.plan(task);
    steps.push(...plan.steps);

    for (const step of plan.steps) {
      step.status = 'running';
      const codeResult = await this.code(step.description);
      step.output = codeResult;

      let fixAttempts = 0;
      while (fixAttempts < 3) {
        const verifyResult = await this.verify(step.description, codeResult);
        if (verifyResult.passed) {
          step.status = 'success';
          break;
        }
        step.output = await this.code(`${step.description}\n\nFix issues: ${verifyResult.feedback}`);
        fixAttempts++;
      }

      if (step.status !== 'success') {
        step.status = 'failed';
      }
    }

    const successCount = steps.filter((s) => s.status === 'success').length;
    return {
      success: successCount === steps.length,
      steps,
      summary: `Completed ${successCount}/${steps.length} steps successfully`,
    };
  }

  private async plan(task: string): Promise<{ steps: OrchestratorStep[] }> {
    const prompt: ProviderMessage[] = [
      { role: 'user', content: `Decompose this task into numbered steps with clear success criteria:\n\n${task}\n\nRespond with a JSON array of steps: [{"id":"step1","description":"..."}]` },
    ];

    let planText = '';
    for await (const event of this.plannerProvider.streamChat(prompt, this.tools, { maxTurns: 1, timeoutMs: 60_000 }, this.signal)) {
      if (event.type === 'text_delta') planText += event.delta;
    }

    const steps = this.parseSteps(planText);
    return { steps };
  }

  private async code(task: string): Promise<string> {
    const prompt: ProviderMessage[] = [
      { role: 'user', content: `Implement this step:\n\n${task}` },
    ];

    let result = '';
    for await (const event of this.coderProvider.streamChat(prompt, this.tools, { maxTurns: 10, timeoutMs: 120_000 }, this.signal)) {
      if (event.type === 'text_delta') result += event.delta;
    }

    return result;
  }

  private async verify(task: string, codeOutput: string): Promise<{ passed: boolean; feedback: string }> {
    const prompt: ProviderMessage[] = [
      { role: 'user', content: `Verify this implementation:\n\nTask: ${task}\n\nOutput: ${codeOutput}\n\nDoes it meet the requirements? If not, what needs fixing?` },
    ];

    let result = '';
    for await (const event of this.verifierProvider.streamChat(prompt, this.tools, { maxTurns: 1, timeoutMs: 60_000 }, this.signal)) {
      if (event.type === 'text_delta') result += event.delta;
    }

    const passed = result.toLowerCase().includes('yes') || result.toLowerCase().includes('pass');
    return { passed, feedback: result };
  }

  private parseSteps(text: string): OrchestratorStep[] {
    try {
      const jsonMatch = text.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        const steps = JSON.parse(jsonMatch[0]) as Array<{ id: string; description: string }>;
        return steps.map((s) => ({ id: s.id, description: s.description, status: 'pending' as const }));
      }
    } catch { /* fall through */ }
    return [{ id: 'step1', description: text.slice(0, 200), status: 'pending' as const }];
  }
}
