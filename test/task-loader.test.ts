import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { loadTasks } from '../src/task-loader.js';

test('loadTasks discovers seeded task directories', async () => {
  const tasks = await loadTasks(path.resolve('tasks'), path.resolve('fixtures'));

  assert.equal(tasks.length, 16);
  assert.ok(tasks.some((task) => task.config.id === 'research-001-basic'));
  assert.ok(tasks.every((task) => task.prompt.length > 0));
  assert.ok(tasks.every((task) => task.config.fixture === 'typescript-app'));
});
