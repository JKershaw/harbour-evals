import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { materializeGitScenario } from '../src/scenario-loader.js';

const execFileAsync = promisify(execFile);

async function runGit(args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync('git', args, { cwd });
  return result.stdout.trim();
}

async function createSourceRepo(): Promise<{ repoDir: string; commit: string }> {
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harbour-source-repo-'));
  await runGit(['init'], repoDir);
  await runGit(['config', 'user.email', 'evals@example.com'], repoDir);
  await runGit(['config', 'user.name', 'Harbour Evals'], repoDir);
  await fs.mkdir(path.join(repoDir, 'src'), { recursive: true });
  await fs.writeFile(path.join(repoDir, 'src', 'note.txt'), 'first version\n', 'utf8');
  await runGit(['add', '.'], repoDir);
  await runGit(['commit', '-m', 'initial'], repoDir);
  const commit = await runGit(['rev-parse', 'HEAD'], repoDir);
  return { repoDir, commit };
}

test('materializeGitScenario checks out the requested commit into cache', async () => {
  const { repoDir, commit } = await createSourceRepo();
  const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'harbour-scenario-cache-'));
  const workspace = await materializeGitScenario(
    {
      repository: repoDir,
      commit
    },
    cacheRoot
  );

  const content = await fs.readFile(path.join(workspace, 'src', 'note.txt'), 'utf8');
  assert.equal(content, 'first version\n');
});

test('materializeGitScenario returns the same cached workspace on repeat calls', async () => {
  const { repoDir, commit } = await createSourceRepo();
  const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'harbour-scenario-cache-'));
  const first = await materializeGitScenario({ repository: repoDir, commit }, cacheRoot);
  const second = await materializeGitScenario({ repository: repoDir, commit }, cacheRoot);
  assert.equal(second, first);
});

test('materializeGitScenario supports subdir-scoped workspace', async () => {
  const { repoDir, commit } = await createSourceRepo();
  const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'harbour-scenario-cache-'));
  const workspace = await materializeGitScenario({ repository: repoDir, commit, subdir: 'src' }, cacheRoot);
  const content = await fs.readFile(path.join(workspace, 'note.txt'), 'utf8');
  assert.equal(content, 'first version\n');
});
