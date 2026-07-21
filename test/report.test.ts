import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCsvReport, buildMarkdownReport } from '../src/report.js';
import type { SuiteRunResult } from '../src/types.js';

const suite: SuiteRunResult = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  provider: 'mock',
  models: ['model-a'],
  tasks: [
    {
      model: 'model-a',
      taskId: 'research-001-basic',
      taskType: 'research',
      score: 100,
      passed: true,
      durationMs: 12,
      promptTokens: 10,
      completionTokens: 20,
      estimatedCost: 0.01,
      toolCalls: 1,
      failedToolCalls: 0,
      retries: 0,
      transcript: [],
      answer: 'ok',
      breakdown: []
    }
  ]
};

test('buildMarkdownReport renders summary table', () => {
  const markdown = buildMarkdownReport(suite);
  assert.match(markdown, /\| Model \| research \|/);
  assert.match(markdown, /model-a/);
});

test('buildCsvReport renders machine-readable rows', () => {
  const csv = buildCsvReport(suite);
  assert.match(csv, /model,task_id,task_type/);
  assert.match(csv, /research-001-basic/);
});
