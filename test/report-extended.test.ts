import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCsvReport, buildMarkdownReport } from '../src/report.js';
import type { SuiteRunResult } from '../src/types.js';

function makeSuite(overrides: Partial<SuiteRunResult> = {}): SuiteRunResult {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    provider: 'mock',
    models: ['model-a'],
    tasks: [],
    ...overrides
  };
}

test('buildMarkdownReport includes provider and generated date', () => {
  const suite = makeSuite();
  const md = buildMarkdownReport(suite);
  assert.match(md, /Provider: mock/);
  assert.match(md, /Generated: 2026-01-01/);
});

test('buildMarkdownReport renders multi-model table correctly', () => {
  const suite = makeSuite({
    models: ['model-a', 'model-b'],
    tasks: [
      { model: 'model-a', taskId: 't1', taskType: 'bug', score: 80, passed: true, durationMs: 1, promptTokens: 1, completionTokens: 1, estimatedCost: 0, toolCalls: 0, failedToolCalls: 0, retries: 0, transcript: [], answer: '', breakdown: [] },
      { model: 'model-b', taskId: 't1', taskType: 'bug', score: 40, passed: false, durationMs: 1, promptTokens: 1, completionTokens: 1, estimatedCost: 0, toolCalls: 0, failedToolCalls: 0, retries: 0, transcript: [], answer: '', breakdown: [] }
    ]
  });
  const md = buildMarkdownReport(suite);
  assert.match(md, /model-a/);
  assert.match(md, /model-b/);
  assert.match(md, /\| bug \|/);
});

test('buildMarkdownReport shows task details with pass/fail', () => {
  const suite = makeSuite({
    tasks: [
      { model: 'model-a', taskId: 'bug-001', taskType: 'bug', score: 100, passed: true, durationMs: 0, promptTokens: 0, completionTokens: 0, estimatedCost: 0, toolCalls: 0, failedToolCalls: 0, retries: 0, transcript: [], answer: '', breakdown: [] },
      { model: 'model-a', taskId: 'bug-002', taskType: 'bug', score: 0, passed: false, durationMs: 0, promptTokens: 0, completionTokens: 0, estimatedCost: 0, toolCalls: 0, failedToolCalls: 0, retries: 0, transcript: [], answer: '', breakdown: [] }
    ]
  });
  const md = buildMarkdownReport(suite);
  assert.match(md, /pass/);
  assert.match(md, /fail/);
  assert.match(md, /bug-001/);
  assert.match(md, /bug-002/);
});

test('buildMarkdownReport ends with newline', () => {
  const md = buildMarkdownReport(makeSuite());
  assert.ok(md.endsWith('\n'));
});

test('buildCsvReport includes all column headers', () => {
  const csv = buildCsvReport(makeSuite());
  assert.match(csv, /model,task_id,task_type,score,passed,duration_ms,prompt_tokens,completion_tokens,estimated_cost,tool_calls,failed_tool_calls,retries/);
});

test('buildCsvReport escapes commas in values with double-quotes', () => {
  const suite = makeSuite({
    tasks: [
      { model: 'model,with,commas', taskId: 't1', taskType: 'bug', score: 0, passed: false, durationMs: 0, promptTokens: 0, completionTokens: 0, estimatedCost: 0, toolCalls: 0, failedToolCalls: 0, retries: 0, transcript: [], answer: '', breakdown: [] }
    ]
  });
  const csv = buildCsvReport(suite);
  assert.match(csv, /"model,with,commas"/);
});

test('buildCsvReport escapes double-quotes in values', () => {
  const suite = makeSuite({
    tasks: [
      { model: 'model"quoted"', taskId: 't1', taskType: 'bug', score: 0, passed: false, durationMs: 0, promptTokens: 0, completionTokens: 0, estimatedCost: 0, toolCalls: 0, failedToolCalls: 0, retries: 0, transcript: [], answer: '', breakdown: [] }
    ]
  });
  const csv = buildCsvReport(suite);
  assert.match(csv, /"model""quoted"""/);
});

test('buildCsvReport ends with newline', () => {
  const csv = buildCsvReport(makeSuite());
  assert.ok(csv.endsWith('\n'));
});

test('buildCsvReport includes one row per task', () => {
  const suite = makeSuite({
    tasks: [
      { model: 'm', taskId: 't1', taskType: 'bug', score: 50, passed: false, durationMs: 10, promptTokens: 5, completionTokens: 5, estimatedCost: 0.001, toolCalls: 1, failedToolCalls: 0, retries: 0, transcript: [], answer: '', breakdown: [] },
      { model: 'm', taskId: 't2', taskType: 'research', score: 100, passed: true, durationMs: 20, promptTokens: 10, completionTokens: 10, estimatedCost: 0.002, toolCalls: 2, failedToolCalls: 0, retries: 1, transcript: [], answer: '', breakdown: [] }
    ]
  });
  const csv = buildCsvReport(suite);
  const lines = csv.trim().split('\n');
  // 1 header + 2 data rows
  assert.equal(lines.length, 3);
});
