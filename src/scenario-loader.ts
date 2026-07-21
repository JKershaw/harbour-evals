import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { GitScenarioSource } from './types.js';
import { ensureInside } from './utils.js';

const execFileAsync = promisify(execFile);

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function runGit(args: string[], cwd?: string): Promise<void> {
  await execFileAsync('git', args, { cwd, timeout: 90_000 });
}

function scenarioWorkspacePath(checkoutDir: string, scenario: GitScenarioSource): string {
  if (!scenario.subdir) {
    return checkoutDir;
  }
  return ensureInside(checkoutDir, path.join(checkoutDir, scenario.subdir));
}

export async function materializeGitScenario(scenario: GitScenarioSource, cacheRoot: string): Promise<string> {
  const repoHash = hash(scenario.repository);
  const repoMirrorDir = path.join(cacheRoot, 'repos', repoHash);
  const checkoutDir = path.join(cacheRoot, 'checkouts', repoHash, scenario.commit);

  if (await pathExists(checkoutDir)) {
    return scenarioWorkspacePath(checkoutDir, scenario);
  }

  await fs.mkdir(path.dirname(repoMirrorDir), { recursive: true });
  await fs.mkdir(path.dirname(checkoutDir), { recursive: true });

  if (!(await pathExists(repoMirrorDir))) {
    await runGit(['clone', '--no-checkout', scenario.repository, repoMirrorDir]);
  }

  await runGit(['-C', repoMirrorDir, 'fetch', '--depth', '1', 'origin', scenario.commit]);
  await runGit(['-C', repoMirrorDir, 'worktree', 'add', '--detach', checkoutDir, scenario.commit]);
  return scenarioWorkspacePath(checkoutDir, scenario);
}
