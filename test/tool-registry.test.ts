import assert from 'node:assert/strict';
import test from 'node:test';
import { createTools } from '../src/tool-registry.js';
import type { ToolContext } from '../src/types.js';
import path from 'node:path';

const context: ToolContext = {
  fixtureDir: path.resolve('fixtures/typescript-app'),
  searchFixturesDir: path.resolve('fixtures/search'),
  docsFixturesDir: path.resolve('fixtures/docs'),
  gitFixturesDir: path.resolve('fixtures/git')
};

test('createTools returns a map with all requested tools', () => {
  const tools = createTools(['filesystem', 'search', 'documentation', 'terminal', 'git'], context);
  assert.equal(tools.size, 5);
  assert.ok(tools.has('filesystem'));
  assert.ok(tools.has('search'));
  assert.ok(tools.has('documentation'));
  assert.ok(tools.has('terminal'));
  assert.ok(tools.has('git'));
});

test('createTools returns only the requested tools', () => {
  const tools = createTools(['filesystem', 'search'], context);
  assert.equal(tools.size, 2);
  assert.ok(tools.has('filesystem'));
  assert.ok(tools.has('search'));
  assert.equal(tools.has('git'), false);
});

test('createTools returns empty map when no tools requested', () => {
  const tools = createTools([], context);
  assert.equal(tools.size, 0);
});

test('createTools returns tools with correct names', () => {
  const tools = createTools(['filesystem', 'git'], context);
  assert.equal(tools.get('filesystem')?.name, 'filesystem');
  assert.equal(tools.get('git')?.name, 'git');
});
