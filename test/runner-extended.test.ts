import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { EvaluationRunner } from '../src/runner.js';
import { loadTask } from '../src/task-loader.js';
import type { ProviderAdapter, ProviderRequest, ProviderResponse } from '../src/types.js';

class MockProvider implements ProviderAdapter {
  readonly name = 'mock';
  private index = 0;

  constructor(private readonly responses: string[]) {}

  async complete(_request: ProviderRequest): Promise<ProviderResponse> {
    const content = this.responses[this.index] ?? '{"action":"final","answer":"fallback answer"}';
    this.index += 1;
    return { content, promptTokens: 10, completionTokens: 5, estimatedCost: 0.001 };
  }
}

async function bugTask() {
  return loadTask(path.resolve('tasks/bug/001-basic'), path.resolve('fixtures'));
}

test('runner: invalid JSON response triggers retry and increments retries', async () => {
  const task = await bugTask();
  const runner = new EvaluationRunner(
    new MockProvider([
      'this is not json',
      '{"action":"final","answer":"divide zero guard"}'
    ])
  );
  const result = await runner.runTask(task, 'mock');
  assert.equal(result.retries, 1);
  assert.match(result.answer, /divide/);
});

test('runner: exceeding tool call limit triggers retry message', async () => {
  const task = await loadTask(path.resolve('tasks/bug/001-basic'), path.resolve('fixtures'));
  // The task now has max_tool_calls: 6; we'll exceed it by sending 7 tool calls then a final
  const toolCall = '{"action":"tool","tool":"filesystem","input":{"action":"read","path":"src/math.ts"}}';
  const runner = new EvaluationRunner(
    new MockProvider([
      toolCall,
      toolCall,
      toolCall,
      toolCall,
      toolCall,
      toolCall,
      toolCall, // This 7th call should trigger the limit
      '{"action":"final","answer":"divide zero guard"}'
    ])
  );
  const result = await runner.runTask(task, 'mock');
  // Should have retried due to tool limit
  assert.ok(result.retries >= 1);
});

test('runner: using unavailable tool triggers retry', async () => {
  const task = await bugTask();
  const runner = new EvaluationRunner(
    new MockProvider([
      '{"action":"tool","tool":"git","input":{"command":"log"}}', // git not in task tools
      '{"action":"final","answer":"divide zero guard"}'
    ])
  );
  const result = await runner.runTask(task, 'mock');
  assert.equal(result.retries, 1);
  assert.equal(result.toolCalls, 0); // unavailable tool shouldn't count
});

test('runner: falls back to default answer when steps exhausted without final', async () => {
  const task = await bugTask();
  // Repeat the same tool call more times than max_steps (8) to exhaust the loop
  const toolCall = '{"action":"tool","tool":"filesystem","input":{"action":"read","path":"src/math.ts"}}';
  const runner = new EvaluationRunner(
    new MockProvider(Array.from({ length: 20 }, () => toolCall))
  );
  const result = await runner.runTask(task, 'mock');
  assert.equal(result.answer, 'No final answer produced.');
});

test('runner: accumulates token counts across steps', async () => {
  const task = await bugTask();
  const runner = new EvaluationRunner(
    new MockProvider([
      '{"action":"tool","tool":"filesystem","input":{"action":"read","path":"src/math.ts"}}',
      '{"action":"final","answer":"divide zero guard"}'
    ])
  );
  const result = await runner.runTask(task, 'mock');
  // 2 steps × 10 prompt + 5 completion each
  assert.equal(result.promptTokens, 20);
  assert.equal(result.completionTokens, 10);
});

test('runner: failed tool call is counted in failedToolCalls', async () => {
  const task = await bugTask();
  // Request a missing file to trigger a tool error
  const runner = new EvaluationRunner(
    new MockProvider([
      '{"action":"tool","tool":"filesystem","input":{"action":"read","path":"nonexistent.ts"}}',
      '{"action":"final","answer":"divide zero guard"}'
    ])
  );
  const result = await runner.runTask(task, 'mock');
  assert.equal(result.failedToolCalls, 1);
  assert.equal(result.toolCalls, 1);
});

test('runner: transcript includes system, user, and assistant messages', async () => {
  const task = await bugTask();
  const runner = new EvaluationRunner(
    new MockProvider(['{"action":"final","answer":"divide zero guard"}'])
  );
  const result = await runner.runTask(task, 'mock');
  assert.ok(result.transcript.some((m) => m.role === 'system'));
  assert.ok(result.transcript.some((m) => m.role === 'user'));
  assert.ok(result.transcript.some((m) => m.role === 'assistant'));
});

test('runner: result includes model and task metadata', async () => {
  const task = await bugTask();
  const runner = new EvaluationRunner(
    new MockProvider(['{"action":"final","answer":"divide zero guard"}'])
  );
  const result = await runner.runTask(task, 'my-model');
  assert.equal(result.model, 'my-model');
  assert.equal(result.taskId, task.config.id);
  assert.equal(result.taskType, task.config.type);
});
