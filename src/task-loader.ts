import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import type { ExpectedDefinition, LoadedTask, TaskConfig } from './types.js';

async function directoryEntries(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries.filter((entry: Dirent) => entry.isDirectory()).map((entry: Dirent) => path.join(root, entry.name));
}

export async function loadTasks(tasksRoot: string, fixturesRoot: string): Promise<LoadedTask[]> {
  const taskTypes = await directoryEntries(tasksRoot);
  const taskDirs: string[] = [];

  for (const taskTypeDir of taskTypes) {
    const entries = await directoryEntries(taskTypeDir);
    for (const entry of entries) {
      taskDirs.push(entry);
    }
  }

  const tasks = await Promise.all(taskDirs.map((taskDir) => loadTask(taskDir, fixturesRoot)));
  return tasks.sort((left, right) => left.config.id.localeCompare(right.config.id));
}

export async function loadTask(taskDir: string, fixturesRoot: string): Promise<LoadedTask> {
  const [taskYaml, prompt, expectedYaml] = await Promise.all([
    fs.readFile(path.join(taskDir, 'task.yaml'), 'utf8'),
    fs.readFile(path.join(taskDir, 'prompt.md'), 'utf8'),
    fs.readFile(path.join(taskDir, 'expected.yaml'), 'utf8')
  ]);

  const config = parse(taskYaml) as TaskConfig;
  const expected = parse(expectedYaml) as ExpectedDefinition;

  if (!config.id || !config.type) {
    throw new Error(`Task at ${taskDir} is missing required fields`);
  }

  const hasFixture = typeof config.fixture === 'string' && config.fixture.length > 0;
  const hasScenario = Boolean(config.scenario);

  if (!hasFixture && !hasScenario) {
    throw new Error(`Task at ${taskDir} must define either fixture or scenario`);
  }

  if (hasScenario) {
    if (!config.scenario?.repository) {
      throw new Error(`Task at ${taskDir} scenario.repository is required`);
    }
    if (!config.scenario.commit) {
      throw new Error(`Task at ${taskDir} scenario.commit is required`);
    }
  }

  return {
    config: {
      ...config,
      max_steps: config.max_steps ?? 8,
      max_tool_calls: config.max_tool_calls ?? 6,
      timeout_seconds: config.timeout_seconds ?? 120
    },
    prompt,
    expected,
    taskDir,
    fixtureDir: hasFixture ? path.join(fixturesRoot, config.fixture as string) : ''
  };
}
