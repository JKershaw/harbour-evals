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
  // Try plain JSON first
  try {
    const parsed = JSON.parse(content) as AgentResponse;
    if (parsed && typeof parsed === 'object' && 'action' in parsed) {
      return parsed;
    }
  } catch {
    // fall through to extraction fallbacks
  }

  // Fallback: extract JSON object embedded in surrounding text (e.g. preamble + JSON)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as AgentResponse;
      if (parsed && typeof parsed === 'object' && 'action' in parsed) {
        return parsed;
      }
    } catch {
      // fall through to XML fallback
    }
  }

  // Fallback: parse <tool_call>TOOL<arg_key>K</arg_key><arg_value>V</arg_value>...</tool_call>
  const xmlMatch = content.match(/<tool_call>([\w-]+)([\s\S]*?)<\/tool_call>/);
  if (xmlMatch) {
    const toolName = xmlMatch[1];
    const argsXml = xmlMatch[2] ?? '';
    const input: Record<string, string> = {};
    const argPairs = [...argsXml.matchAll(/<arg_key>([\s\S]*?)<\/arg_key><arg_value>([\s\S]*?)<\/arg_value>/g)];
    for (const pair of argPairs) {
      if (pair[1] && pair[2] !== undefined) {
        input[pair[1]] = pair[2];
      }
    }
    return { action: 'tool', tool: toolName, input } as AgentResponse;
  }

  return null;
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

    for (let step = 0; step < (task.config.max_steps ?? 12); step += 1) {
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
        // If the model keeps producing tool calls after limit, extract plain text as answer
        // only when it looks like a substantive final answer (not a transition sentence)
        const plainText = response.content
          .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
          .replace(/\{[\s\S]*\}/g, '')
          .trim();
        const TRANSITION_STARTERS = ["let me", "now let me", "i'll", "i need to", "i will", "let's", "next,", "first,", "first let"];
        const looksLikeTransition = TRANSITION_STARTERS.some((s) => plainText.toLowerCase().startsWith(s));
        if (plainText.length > 150 && !looksLikeTransition) {
          answer = plainText;
          break;
        }
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

      // Merge top-level non-reserved keys into the input (models sometimes place input fields at top level)
      const RESERVED_KEYS = new Set(['action', 'tool', 'input', 'answer']);
      const topLevelExtras: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parsed as unknown as Record<string, unknown>)) {
        if (!RESERVED_KEYS.has(key)) {
          topLevelExtras[key] = value;
        }
      }
      const toolInput: Record<string, unknown> = {
        ...(typeof parsed.input === 'object' && parsed.input !== null ? (parsed.input as Record<string, unknown>) : {}),
        ...topLevelExtras
      };
      const toolResponse = await tool.execute(toolInput);
      toolCalls.push({ tool: parsed.tool, input: toolInput, ok: toolResponse.ok, response: toolResponse.data ?? toolResponse.error ?? null });
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
