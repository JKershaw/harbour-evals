import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
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

// SearchTool — fuzzy match

test('SearchTool: fuzzy match finds closest fixture when no exact match', async () => {
  // "async handlers" slugifies to "async_handlers" — no exact fixture, but "async_handler_patterns" is close
  const tool = new SearchTool(context);
  const result = await tool.execute({ query: 'async handlers' });
  assert.equal(result.ok, true);
  const data = result.data as Record<string, unknown>;
  const results = data?.results as unknown[];
  assert.ok(Array.isArray(results) && results.length > 0, 'expected fuzzy match to return non-empty results');
});

test('SearchTool: fuzzy match does not fire for completely unrelated query', async () => {
  const tool = new SearchTool(context);
  const result = await tool.execute({ query: 'quantum computing blockchain nft' });
  assert.equal(result.ok, true);
  assert.deepEqual((result.data as Record<string, unknown>)?.results, []);
});

// DocumentationTool — fuzzy match

test('DocumentationTool: fuzzy match finds closest fixture when no exact match', async () => {
  // "async handler" slugifies to "async_handler" — no exact fixture, but "async_handler_patterns" is close
  const tool = new DocumentationTool(context);
  const result = await tool.execute({ query: 'async handler' });
  assert.equal(result.ok, true);
  const data = result.data as Record<string, unknown>;
  assert.ok(typeof data?.content === 'string' && (data.content as string).length > 0, 'expected fuzzy match to return non-empty content');
});

test('DocumentationTool: fuzzy match does not fire for completely unrelated query', async () => {
  const tool = new DocumentationTool(context);
  const result = await tool.execute({ query: 'quantum computing blockchain nft' });
  assert.equal(result.ok, true);
  assert.equal((result.data as Record<string, unknown>)?.content, '');
});

// SearchTool — task-local fixture lookup

test('SearchTool: uses task-local search fixture when taskDir is provided', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harbour-test-'));
  try {
    const searchDir = path.join(tmpDir, 'search');
    await fs.mkdir(searchDir);
    await fs.writeFile(
      path.join(searchDir, 'local_only_query.json'),
      JSON.stringify({ query: 'local only query', results: [{ title: 'Local Result', snippet: 'local content' }] })
    );
    const localContext: ToolContext = { ...context, taskDir: tmpDir };
    const tool = new SearchTool(localContext);
    const result = await tool.execute({ query: 'local only query' });
    assert.equal(result.ok, true);
    const results = (result.data as Record<string, unknown>)?.results as unknown[];
    assert.ok(Array.isArray(results) && results.length > 0, 'expected task-local fixture to be found');
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

test('SearchTool: task-local fixture takes priority over global fixture for same slug', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harbour-test-'));
  try {
    const searchDir = path.join(tmpDir, 'search');
    await fs.mkdir(searchDir);
    await fs.writeFile(
      path.join(searchDir, 'prisma_relation_mode.json'),
      JSON.stringify({ query: 'Prisma relation mode', results: [{ title: 'Local Override', snippet: 'local' }] })
    );
    const localContext: ToolContext = { ...context, taskDir: tmpDir };
    const tool = new SearchTool(localContext);
    const result = await tool.execute({ query: 'Prisma relation mode' });
    assert.equal(result.ok, true);
    const results = (result.data as Record<string, unknown>)?.results as Array<Record<string, unknown>>;
    assert.equal(results?.[0]?.title, 'Local Override', 'expected task-local fixture to override global');
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

// DocumentationTool — task-local fixture lookup

test('DocumentationTool: uses task-local docs fixture when taskDir is provided', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harbour-test-'));
  try {
    const docsDir = path.join(tmpDir, 'docs');
    await fs.mkdir(docsDir);
    await fs.writeFile(path.join(docsDir, 'local_only_topic.md'), '# Local Topic\nLocal content here.');
    const localContext: ToolContext = { ...context, taskDir: tmpDir };
    const tool = new DocumentationTool(localContext);
    const result = await tool.execute({ query: 'local only topic' });
    assert.equal(result.ok, true);
    const content = (result.data as Record<string, unknown>)?.content as string;
    assert.ok(content.includes('Local content here.'), 'expected task-local docs fixture to be found');
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

test('DocumentationTool: task-local fixture takes priority over global fixture for same slug', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harbour-test-'));
  try {
    const docsDir = path.join(tmpDir, 'docs');
    await fs.mkdir(docsDir);
    await fs.writeFile(path.join(docsDir, 'prisma_relation_mode.md'), '# Local Override\nOverridden content.');
    const localContext: ToolContext = { ...context, taskDir: tmpDir };
    const tool = new DocumentationTool(localContext);
    const result = await tool.execute({ query: 'prisma relation mode' });
    assert.equal(result.ok, true);
    const content = (result.data as Record<string, unknown>)?.content as string;
    assert.ok(content.includes('Overridden content.'), 'expected task-local doc to override global');
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

// GitTool — task-local fixture lookup

test('GitTool: uses task-local git fixture when taskDir is provided', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harbour-test-'));
  try {
    const gitDir = path.join(tmpDir, 'git');
    await fs.mkdir(gitDir);
    await fs.writeFile(path.join(gitDir, 'diff.txt'), 'local diff content');
    const localContext: ToolContext = { ...context, taskDir: tmpDir };
    const tool = new GitTool(localContext);
    const result = await tool.execute({ command: 'diff' });
    assert.equal(result.ok, true);
    assert.equal((result.data as Record<string, unknown>)?.content, 'local diff content');
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

test('GitTool: falls back to global git fixture when no task-local fixture exists', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harbour-test-'));
  try {
    // tmpDir has no git/ subdirectory — should fall back to global gitFixturesDir
    const localContext: ToolContext = { ...context, taskDir: tmpDir };
    const tool = new GitTool(localContext);
    const result = await tool.execute({ command: 'diff' });
    assert.equal(result.ok, true);
    assert.ok(typeof (result.data as Record<string, unknown>)?.content === 'string');
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});
