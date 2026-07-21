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
    const content = this.responses[this.index] ?? '{"action":"final","answer":"No final answer produced."}';
    this.index += 1;
    return {
      content,
      promptTokens: 10,
      completionTokens: 10,
      estimatedCost: 0
    };
  }
}

test('runner executes tool loop and scores final answer', async () => {
  const task = await loadTask(path.resolve('tasks/bug/001-basic'), path.resolve('fixtures'));
  const runner = new EvaluationRunner(
    new MockProvider([
      '{"action":"tool","tool":"filesystem","input":{"action":"read","path":"src/math.ts"}}',
      '{"action":"final","answer":"The bug is in divide and the fix is to add a zero validation guard."}'
    ])
  );

  const result = await runner.runTask(task, 'mock-model');

  assert.equal(result.passed, true);
  assert.equal(result.toolCalls, 1);
  assert.match(result.answer, /divide/);
});
