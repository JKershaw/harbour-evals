import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scoreTask, summarizeByType } from '../src/scorer.js';
import type { LoadedTask, TaskRunResult, ToolCallRecord } from '../src/types.js';

function makeTask(overrides: Partial<LoadedTask['expected']> = {}): LoadedTask {
  return {
    config: {
      id: 'test-001',
      type: 'test',
      fixture: 'typescript-app',
      tools: [],
      max_steps: 8,
      max_tool_calls: 6,
      timeout_seconds: 120
    },
    prompt: 'Test prompt',
    expected: {
      required: [],
      optional: [],
      ...overrides
    },
    taskDir: '/tmp',
    fixtureDir: os.tmpdir()
  };
}

const noToolCalls: ToolCallRecord[] = [];

test('scoreTask: contains check passes when answer includes value', async () => {
  const task = makeTask({ required: [{ id: 'c1', type: 'contains', value: 'divide' }] });
  const result = await scoreTask(task, 'The bug is in divide', noToolCalls);
  assert.equal(result.passed, true);
  assert.equal(result.score, 80);
});

test('scoreTask: contains check fails when value is absent', async () => {
  const task = makeTask({ required: [{ id: 'c1', type: 'contains', value: 'divide' }] });
  const result = await scoreTask(task, 'Nothing relevant here', noToolCalls);
  assert.equal(result.passed, false);
  assert.equal(result.score, 0);
});

test('scoreTask: contains check is case-insensitive', async () => {
  const task = makeTask({ required: [{ id: 'c1', type: 'contains', value: 'Divide' }] });
  const result = await scoreTask(task, 'The bug is in DIVIDE', noToolCalls);
  assert.equal(result.passed, true);
});

test('scoreTask: contains_any check passes when at least one value matches', async () => {
  const task = makeTask({
    required: [{ id: 'c1', type: 'contains_any', values: ['zero', 'guard', 'validation'] }]
  });
  const result = await scoreTask(task, 'add a zero check', noToolCalls);
  assert.equal(result.passed, true);
});

test('scoreTask: contains_any check fails when no value matches', async () => {
  const task = makeTask({
    required: [{ id: 'c1', type: 'contains_any', values: ['zero', 'guard'] }]
  });
  const result = await scoreTask(task, 'nothing matches here', noToolCalls);
  assert.equal(result.passed, false);
});

test('scoreTask: contains_all check passes when all values match', async () => {
  const task = makeTask({
    required: [{ id: 'c1', type: 'contains_all', values: ['divide', 'zero'] }]
  });
  const result = await scoreTask(task, 'divide by zero error', noToolCalls);
  assert.equal(result.passed, true);
});

test('scoreTask: contains_all check fails when one value is absent', async () => {
  const task = makeTask({
    required: [{ id: 'c1', type: 'contains_all', values: ['divide', 'zero'] }]
  });
  const result = await scoreTask(task, 'only mentions divide', noToolCalls);
  assert.equal(result.passed, false);
});

test('scoreTask: tool_called check passes when tool appears in calls', async () => {
  const task = makeTask({ required: [{ id: 'c1', type: 'tool_called', value: 'filesystem' }] });
  const toolCalls: ToolCallRecord[] = [{ tool: 'filesystem', input: {}, ok: true, response: null }];
  const result = await scoreTask(task, 'answer', toolCalls);
  assert.equal(result.passed, true);
});

test('scoreTask: tool_called check fails when tool not in calls', async () => {
  const task = makeTask({ required: [{ id: 'c1', type: 'tool_called', value: 'search' }] });
  const toolCalls: ToolCallRecord[] = [{ tool: 'filesystem', input: {}, ok: true, response: null }];
  const result = await scoreTask(task, 'answer', toolCalls);
  assert.equal(result.passed, false);
});

test('scoreTask: documentation_cited check passes with exact citation string in answer', async () => {
  const task = makeTask({
    required: [{ id: 'c1', type: 'documentation_cited', values: ['[docs:prisma-relation-mode]'] }]
  });
  const result = await scoreTask(task, 'See [docs:prisma-relation-mode] for details', noToolCalls);
  assert.equal(result.passed, true);
});

test('scoreTask: documentation_cited check fails when citation is absent', async () => {
  const task = makeTask({
    required: [{ id: 'c1', type: 'documentation_cited', values: ['[docs:prisma-relation-mode]'] }]
  });
  const result = await scoreTask(task, 'No citation here', noToolCalls);
  assert.equal(result.passed, false);
});

test('scoreTask: file_exists check passes when file is present in fixtureDir', async () => {
  // Use a file we know exists in the real fixture
  const task: LoadedTask = {
    ...makeTask({ required: [{ id: 'c1', type: 'file_exists', value: 'package.json' }] }),
    fixtureDir: path.resolve('fixtures/typescript-app')
  };
  const result = await scoreTask(task, 'answer', noToolCalls);
  assert.equal(result.passed, true);
});

test('scoreTask: file_exists check fails when file is absent', async () => {
  const task = makeTask({ required: [{ id: 'c1', type: 'file_exists', value: 'nonexistent-file.txt' }] });
  const result = await scoreTask(task, 'answer', noToolCalls);
  assert.equal(result.passed, false);
});

test('scoreTask: file_exists check returns false when value is missing', async () => {
  const task = makeTask({ required: [{ id: 'c1', type: 'file_exists' }] });
  const result = await scoreTask(task, 'answer', noToolCalls);
  assert.equal(result.passed, false);
});

test('scoreTask: string shorthand in required becomes contains check', async () => {
  const task = makeTask({ required: ['divide'] });
  const result = await scoreTask(task, 'the issue is in divide', noToolCalls);
  assert.equal(result.passed, true);
});

test('scoreTask: optional checks contribute to score but do not affect pass', async () => {
  const task = makeTask({
    required: [{ id: 'r1', type: 'contains', value: 'divide' }],
    optional: [{ id: 'o1', type: 'tool_called', value: 'search' }]
  });
  // Pass required, fail optional
  const result = await scoreTask(task, 'divide', noToolCalls);
  assert.equal(result.passed, true);
  assert.equal(result.score, 80); // Only required weight

  // Pass both
  const withSearch: ToolCallRecord[] = [{ tool: 'search', input: {}, ok: true, response: null }];
  const result2 = await scoreTask(task, 'divide', withSearch);
  assert.equal(result2.passed, true);
  assert.equal(result2.score, 100);
});

test('scoreTask: failing required check causes pass=false even with high optional score', async () => {
  const task = makeTask({
    required: [{ id: 'r1', type: 'contains', value: 'divide' }],
    optional: [
      { id: 'o1', type: 'contains', value: 'zero' },
      { id: 'o2', type: 'contains', value: 'guard' }
    ],
    score: { required_weight: 10, optional_weight: 90, pass_threshold: 50 }
  });
  // Fail required, pass all optional
  const result = await scoreTask(task, 'zero guard', noToolCalls);
  assert.equal(result.passed, false);
});

test('scoreTask: custom pass_threshold is respected', async () => {
  const task = makeTask({
    required: [
      { id: 'r1', type: 'contains', value: 'a' },
      { id: 'r2', type: 'contains', value: 'b' }
    ],
    score: { required_weight: 80, optional_weight: 20, pass_threshold: 30 }
  });
  // Only pass one of two required (50% of required weight = 40 score)
  const result = await scoreTask(task, 'only a here', noToolCalls);
  // requiredPassed (1) !== required.length (2), so passed is false regardless of threshold
  assert.equal(result.passed, false);
});

test('scoreTask: score rounds to two decimal places', async () => {
  const task = makeTask({
    required: [
      { id: 'r1', type: 'contains', value: 'alpha' },
      { id: 'r2', type: 'contains', value: 'beta' },
      { id: 'r3', type: 'contains', value: 'gamma' }
    ]
  });
  // Only 'alpha' and 'beta' match; 'gamma' does not
  const result = await scoreTask(task, 'alpha and beta are present', noToolCalls);
  assert.equal(result.score, 53.33); // 80/3*2 = 53.333... → 53.33
});

test('scoreTask: breakdown reflects individual check results', async () => {
  const task = makeTask({
    required: [{ id: 'r1', type: 'contains', value: 'pass' }],
    optional: [{ id: 'o1', type: 'contains', value: 'fail' }]
  });
  const result = await scoreTask(task, 'will pass', noToolCalls);
  const r1 = result.breakdown.find((b) => b.id === 'r1');
  const o1 = result.breakdown.find((b) => b.id === 'o1');
  assert.ok(r1);
  assert.equal(r1.passed, true);
  assert.equal(r1.tier, 'required');
  assert.ok(o1);
  assert.equal(o1.passed, false);
  assert.equal(o1.tier, 'optional');
});

test('scoreTask: unknown check type returns false', async () => {
  const task = makeTask({
    required: [{ id: 'c1', type: 'contains' as 'contains', value: undefined }]
  });
  const result = await scoreTask(task, 'anything', noToolCalls);
  assert.equal(result.breakdown[0]?.passed, false);
});

test('summarizeByType groups by taskType and computes average', () => {
  const results: TaskRunResult[] = [
    { model: 'm1', taskId: 't1', taskType: 'bug', score: 80, passed: true, durationMs: 0, promptTokens: 0, completionTokens: 0, estimatedCost: 0, toolCalls: 0, failedToolCalls: 0, retries: 0, transcript: [], answer: '', breakdown: [] },
    { model: 'm1', taskId: 't2', taskType: 'bug', score: 60, passed: false, durationMs: 0, promptTokens: 0, completionTokens: 0, estimatedCost: 0, toolCalls: 0, failedToolCalls: 0, retries: 0, transcript: [], answer: '', breakdown: [] },
    { model: 'm1', taskId: 't3', taskType: 'research', score: 100, passed: true, durationMs: 0, promptTokens: 0, completionTokens: 0, estimatedCost: 0, toolCalls: 0, failedToolCalls: 0, retries: 0, transcript: [], answer: '', breakdown: [] }
  ];
  const summary = summarizeByType(results);
  assert.equal(summary.get('bug'), 70);
  assert.equal(summary.get('research'), 100);
});

test('summarizeByType returns empty map for empty input', () => {
  const summary = summarizeByType([]);
  assert.equal(summary.size, 0);
});
