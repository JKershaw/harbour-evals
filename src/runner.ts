import path from 'node:path';
import { loadTasks } from './task-loader.js';
import { writeReports } from './report.js';
import { scoreTask } from './scorer.js';
import { createTools } from './tool-registry.js';
import type { AgentResponse, LoadedTask, ProviderAdapter, ProviderMessage, SuiteRunResult, TaskRunResult, ToolCallRecord } from './types.js';

const SYSTEM_PROMPT = `You are an evaluation agent. Output only a single raw JSON object on every turn. Do not add XML tags, markdown code fences, or any text before or after the JSON.

Use exactly one of these two shapes:

Tool call:
{"action":"tool","tool":"<name>","input":{...}}

Final answer:
{"action":"final","answer":"<complete answer as a string>"}

Tool input schemas:
- filesystem: {"action":"list","path":"."} to list a directory, {"action":"read","path":"src/server.ts"} to read a file
- search: {"query":"your search terms"}
- documentation: {"query":"topic to look up"}
- git: {"command":"diff"} — allowed commands: diff, status, log, show
- terminal: {"command":"npm test"}

If your previous output was rejected, emit only the JSON object with no surrounding text.`;

function parseAgentResponse(content: string): AgentResponse | null {
  try {
    return JSON.parse(content) as AgentResponse;
  } catch {
    return null;
  }
}

function taskPrompt(task: LoadedTask): string {
  return [
    `Task ID: ${task.config.id}`,
    `Task Type: ${task.config.type}`,
    `Available Tools: ${task.config.tools.join(', ') || 'none'}`,
    '',
    task.prompt,
    '',
    'When you need information, call one tool at a time. Finish with a concise final answer.'
  ].join('\n');
}

export class EvaluationRunner {
  constructor(private readonly provider: ProviderAdapter) {}

  async runTask(task: LoadedTask, model: string): Promise<TaskRunResult> {
    const transcript: ProviderMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: taskPrompt(task) }];
    const tools = createTools(task.config.tools, {
      fixtureDir: task.fixtureDir,
      searchFixturesDir: path.join(process.cwd(), 'fixtures', 'search'),
      docsFixturesDir: path.join(process.cwd(), 'fixtures', 'docs'),
      gitFixturesDir: path.join(process.cwd(), 'fixtures', 'git')
    });
    const toolCalls: ToolCallRecord[] = [];
    const startedAt = Date.now();
    const deadline = startedAt + (task.config.timeout_seconds ?? 120) * 1000;
    let promptTokens = 0;
    let completionTokens = 0;
    let estimatedCost = 0;
    let retries = 0;
    let answer = '';

    for (let step = 0; step < (task.config.max_steps ?? 8); step += 1) {
      if (Date.now() > deadline) {
        break;
      }

      const response = await this.provider.complete({
        model,
        messages: transcript,
        timeoutMs: Math.max(1_000, deadline - Date.now())
      });
      promptTokens += response.promptTokens;
      completionTokens += response.completionTokens;
      estimatedCost += response.estimatedCost;
      transcript.push({ role: 'assistant', content: response.content });

      const parsed = parseAgentResponse(response.content);
      if (!parsed) {
        retries += 1;
        transcript.push({ role: 'user', content: 'Your previous reply was invalid JSON. Reply with valid JSON only.' });
        continue;
      }

      if (parsed.action === 'final') {
        answer = parsed.answer;
        break;
      }

      if (toolCalls.length >= (task.config.max_tool_calls ?? 6)) {
        retries += 1;
        transcript.push({ role: 'user', content: 'You have reached the tool-call limit. Return a final answer now.' });
        continue;
      }

      const tool = tools.get(parsed.tool);
      if (!tool) {
        retries += 1;
        transcript.push({ role: 'user', content: `Tool ${parsed.tool} is not available. Return a final answer or use an allowed tool.` });
        continue;
      }

      const toolResponse = await tool.execute(parsed.input);
      toolCalls.push({ tool: parsed.tool, input: parsed.input, ok: toolResponse.ok, response: toolResponse.data ?? toolResponse.error ?? null });
      transcript.push({
        role: 'user',
        content: `TOOL RESULT ${parsed.tool}: ${JSON.stringify(toolResponse)}`
      });
    }

    if (!answer) {
      answer = 'No final answer produced.';
    }

    const score = await scoreTask(task, answer, toolCalls);

    return {
      model,
      taskId: task.config.id,
      taskType: task.config.type,
      score: score.score,
      passed: score.passed,
      durationMs: Date.now() - startedAt,
      promptTokens,
      completionTokens,
      estimatedCost: Math.round(estimatedCost * 1_000_000) / 1_000_000,
      toolCalls: toolCalls.length,
      failedToolCalls: toolCalls.filter((toolCall) => !toolCall.ok).length,
      retries,
      transcript,
      answer,
      breakdown: score.breakdown
    };
  }

  async runSuite(models: string[], tasksRoot: string, fixturesRoot: string, resultsDir: string): Promise<SuiteRunResult> {
    const tasks = await loadTasks(tasksRoot, fixturesRoot);
    const results: TaskRunResult[] = [];
    const taskDelayMs = Math.max(0, parseInt(process.env.TASK_DELAY_MS ?? '0', 10) || 0);

    for (const model of models) {
      for (const task of tasks) {
        if (taskDelayMs > 0 && results.length > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, taskDelayMs));
        }
        results.push(await this.runTask(task, model));
      }
    }

    const run: SuiteRunResult = {
      generatedAt: new Date().toISOString(),
      provider: this.provider.name,
      models,
      tasks: results
    };

    run.runDir = await writeReports(resultsDir, run);
    return run;
  }
}
