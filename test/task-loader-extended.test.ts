import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadTask } from '../src/task-loader.js';

async function makeTempTaskDir(
  fields: { id?: string; type?: string; fixture?: string; scenarioBlock?: string; omitFixture?: boolean } = {}
): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harbour-task-'));
  const lines = [
    `id: "${fields.id ?? 'test-001'}"`,
    `type: "${fields.type ?? 'test'}"`,
    'tools: []'
  ];
  if (!fields.omitFixture) {
    lines.splice(2, 0, `fixture: "${fields.fixture ?? 'typescript-app'}"`);
  }
  if (fields.scenarioBlock) {
    lines.push(fields.scenarioBlock);
  }
  const taskYaml = lines.join('\n');
  const expectedYaml = 'required: []\noptional: []';
  const prompt = 'Test prompt';
  await fs.writeFile(path.join(tmpDir, 'task.yaml'), taskYaml, 'utf8');
  await fs.writeFile(path.join(tmpDir, 'expected.yaml'), expectedYaml, 'utf8');
  await fs.writeFile(path.join(tmpDir, 'prompt.md'), prompt, 'utf8');
  return tmpDir;
}

test('loadTask applies default values for optional fields', async () => {
  const tmpDir = await makeTempTaskDir();
  const task = await loadTask(tmpDir, path.resolve('fixtures'));
  assert.equal(task.config.max_steps, 8);
  assert.equal(task.config.max_tool_calls, 6);
  assert.equal(task.config.timeout_seconds, 120);
});

test('loadTask reads prompt and expected from files', async () => {
  const tmpDir = await makeTempTaskDir();
  const task = await loadTask(tmpDir, path.resolve('fixtures'));
  assert.equal(task.prompt, 'Test prompt');
  assert.deepEqual(task.expected.required, []);
});

test('loadTask sets fixtureDir relative to fixturesRoot', async () => {
  const tmpDir = await makeTempTaskDir({ fixture: 'typescript-app' });
  const fixturesRoot = path.resolve('fixtures');
  const task = await loadTask(tmpDir, fixturesRoot);
  assert.equal(task.fixtureDir, path.join(fixturesRoot, 'typescript-app'));
});

test('loadTask throws when id is missing', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harbour-task-'));
  await fs.writeFile(path.join(tmpDir, 'task.yaml'), 'type: "test"\nfixture: "typescript-app"\ntools: []', 'utf8');
  await fs.writeFile(path.join(tmpDir, 'expected.yaml'), 'required: []', 'utf8');
  await fs.writeFile(path.join(tmpDir, 'prompt.md'), 'prompt', 'utf8');
  await assert.rejects(() => loadTask(tmpDir, path.resolve('fixtures')), /missing required fields/);
});

test('loadTask throws when type is missing', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harbour-task-'));
  await fs.writeFile(path.join(tmpDir, 'task.yaml'), 'id: "test-001"\nfixture: "typescript-app"\ntools: []', 'utf8');
  await fs.writeFile(path.join(tmpDir, 'expected.yaml'), 'required: []', 'utf8');
  await fs.writeFile(path.join(tmpDir, 'prompt.md'), 'prompt', 'utf8');
  await assert.rejects(() => loadTask(tmpDir, path.resolve('fixtures')), /missing required fields/);
});

test('loadTask throws when fixture is missing', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harbour-task-'));
  await fs.writeFile(path.join(tmpDir, 'task.yaml'), 'id: "test-001"\ntype: "bug"\ntools: []', 'utf8');
  await fs.writeFile(path.join(tmpDir, 'expected.yaml'), 'required: []', 'utf8');
  await fs.writeFile(path.join(tmpDir, 'prompt.md'), 'prompt', 'utf8');
  await assert.rejects(() => loadTask(tmpDir, path.resolve('fixtures')), /must define either fixture or scenario/);
});

test('loadTask supports scenario source without fixture', async () => {
  const tmpDir = await makeTempTaskDir({
    omitFixture: true,
    scenarioBlock: ['scenario:', '  repository: "https://github.com/example/project.git"', '  commit: "abc123def456"'].join('\n')
  });
  const task = await loadTask(tmpDir, path.resolve('fixtures'));
  assert.equal(task.config.fixture, undefined);
  assert.equal(task.config.scenario?.repository, 'https://github.com/example/project.git');
  assert.equal(task.config.scenario?.commit, 'abc123def456');
});

test('loadTask throws when both fixture and scenario are missing', async () => {
  const tmpDir = await makeTempTaskDir({ omitFixture: true });
  await assert.rejects(() => loadTask(tmpDir, path.resolve('fixtures')), /must define either fixture or scenario/);
});

test('loadTask throws when scenario commit is missing', async () => {
  const tmpDir = await makeTempTaskDir({
    omitFixture: true,
    scenarioBlock: ['scenario:', '  repository: "https://github.com/example/project.git"'].join('\n')
  });
  await assert.rejects(() => loadTask(tmpDir, path.resolve('fixtures')), /scenario.commit is required/);
});

test('loadTask throws when task.yaml is missing', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harbour-task-'));
  await fs.writeFile(path.join(tmpDir, 'expected.yaml'), 'required: []', 'utf8');
  await fs.writeFile(path.join(tmpDir, 'prompt.md'), 'prompt', 'utf8');
  await assert.rejects(() => loadTask(tmpDir, path.resolve('fixtures')));
});
