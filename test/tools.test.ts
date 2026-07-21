import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { DocumentationTool } from '../tools/documentation.js';
import { FilesystemTool } from '../tools/filesystem.js';
import { GitTool } from '../tools/git.js';
import { SearchTool } from '../tools/search.js';
import { TerminalTool } from '../tools/terminal.js';
import type { ToolContext } from '../src/types.js';

const context: ToolContext = {
  fixtureDir: path.resolve('fixtures/typescript-app'),
  searchFixturesDir: path.resolve('fixtures/search'),
  docsFixturesDir: path.resolve('fixtures/docs'),
  gitFixturesDir: path.resolve('fixtures/git')
};

// FilesystemTool

test('FilesystemTool: read action returns file content', async () => {
  const tool = new FilesystemTool(context);
  const result = await tool.execute({ action: 'read', path: 'src/math.ts' });
  assert.equal(result.ok, true);
  assert.ok(typeof (result.data as Record<string, unknown>)?.content === 'string');
});

test('FilesystemTool: list action returns directory entries', async () => {
  const tool = new FilesystemTool(context);
  const result = await tool.execute({ action: 'list', path: 'src' });
  assert.equal(result.ok, true);
  const entries = result.data as Array<{ name: string; type: string }>;
  assert.ok(Array.isArray(entries));
  assert.ok(entries.some((e) => e.name === 'math.ts'));
});

test('FilesystemTool: exists action returns true for existing file', async () => {
  const tool = new FilesystemTool(context);
  const result = await tool.execute({ action: 'exists', path: 'package.json' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { exists: true });
});

test('FilesystemTool: returns error for missing file', async () => {
  const tool = new FilesystemTool(context);
  const result = await tool.execute({ action: 'read', path: 'nonexistent.ts' });
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test('FilesystemTool: returns error when path is empty', async () => {
  const tool = new FilesystemTool(context);
  const result = await tool.execute({ action: 'read', path: '' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'path is required');
});

test('FilesystemTool: rejects path traversal outside fixture root', async () => {
  const tool = new FilesystemTool(context);
  await assert.rejects(
    () => tool.execute({ action: 'read', path: '../../package.json' }),
    /Path escapes fixture root/
  );
});

test('FilesystemTool: defaults to read action when action is unspecified', async () => {
  const tool = new FilesystemTool(context);
  const result = await tool.execute({ path: 'package.json' });
  assert.equal(result.ok, true);
});

// SearchTool

test('SearchTool: returns results for known query fixture', async () => {
  const tool = new SearchTool(context);
  const result = await tool.execute({ query: 'Prisma relation mode' });
  assert.equal(result.ok, true);
  assert.ok(result.data);
});

test('SearchTool: returns empty results for unknown query', async () => {
  const tool = new SearchTool(context);
  const result = await tool.execute({ query: 'completely unknown query xyz123' });
  assert.equal(result.ok, true);
  assert.deepEqual((result.data as Record<string, unknown>)?.results, []);
});

test('SearchTool: returns error when query is empty', async () => {
  const tool = new SearchTool(context);
  const result = await tool.execute({ query: '' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'query is required');
});

// DocumentationTool

test('DocumentationTool: returns content for known docs fixture', async () => {
  const tool = new DocumentationTool(context);
  const result = await tool.execute({ query: 'prisma relation mode' });
  assert.equal(result.ok, true);
  assert.ok(typeof (result.data as Record<string, unknown>)?.content === 'string');
});

test('DocumentationTool: returns empty content for unknown query', async () => {
  const tool = new DocumentationTool(context);
  const result = await tool.execute({ query: 'unknown topic xyz123' });
  assert.equal(result.ok, true);
  assert.equal((result.data as Record<string, unknown>)?.content, '');
});

test('DocumentationTool: returns error when query is empty', async () => {
  const tool = new DocumentationTool(context);
  const result = await tool.execute({ query: '' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'query is required');
});

// GitTool

test('GitTool: returns content for allowed git command', async () => {
  const tool = new GitTool(context);
  const result = await tool.execute({ command: 'log' });
  assert.equal(result.ok, true);
  assert.ok(typeof (result.data as Record<string, unknown>)?.content === 'string');
});

test('GitTool: returns error for disallowed command', async () => {
  const tool = new GitTool(context);
  const result = await tool.execute({ command: 'push' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'unsupported git command');
});

test('GitTool: returns error when command is empty string', async () => {
  const tool = new GitTool(context);
  const result = await tool.execute({ command: '' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'unsupported git command');
});

test('GitTool: handles status, diff, show commands', async () => {
  const tool = new GitTool(context);
  for (const command of ['status', 'diff', 'show']) {
    const result = await tool.execute({ command });
    assert.equal(result.ok, true, `Expected ok for command: ${command}`);
  }
});

// TerminalTool

test('TerminalTool: returns error when command is empty', async () => {
  const tool = new TerminalTool(context);
  const result = await tool.execute({ command: '' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'command is required');
});

test('TerminalTool: returns error for disallowed binary', async () => {
  const tool = new TerminalTool(context);
  const result = await tool.execute({ command: 'rm -rf .' });
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /not allowed/);
});

test('TerminalTool: blocks shell injection tokens', async () => {
  const tool = new TerminalTool(context);
  for (const injection of ['npm && rm -rf .', 'npm; echo pwned', 'npm | cat /etc/passwd', 'npm > /tmp/out', 'npm $(id)']) {
    const result = await tool.execute({ command: injection });
    assert.equal(result.ok, false, `Expected blocked for: ${injection}`);
    assert.match(result.error ?? '', /blocked shell syntax/);
  }
});

test('TerminalTool: returns error for path traversal in cwd', async () => {
  const tool = new TerminalTool(context);
  await assert.rejects(
    () => tool.execute({ command: 'npm list', cwd: '../../' }),
    /Path escapes fixture root/
  );
});
