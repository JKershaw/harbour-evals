import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { loadTask } from '../src/task-loader.js';
import { scoreTask } from '../src/scorer.js';

test('scoreTask awards full score for matching required and optional checks', async () => {
  const task = await loadTask(path.resolve('tasks/research/001-basic'), path.resolve('fixtures'));
  const result = await scoreTask(
    task,
    'The root cause is the relation mode prisma setting. See [docs:prisma-relation-mode].',
    [{ tool: 'search', input: { query: 'Prisma relation mode' }, ok: true, response: {} }]
  );

  assert.equal(result.passed, true);
  assert.equal(result.score, 100);
});
