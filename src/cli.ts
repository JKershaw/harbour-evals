import path from 'node:path';
import { OpenRouterProvider } from '../providers/openrouter.js';
import { EvaluationRunner } from './runner.js';

function parseArgs(argv: string[]): { models: string[]; tasksRoot: string; fixturesRoot: string; resultsDir: string } {
  const models: string[] = [];
  let tasksRoot = path.resolve('tasks');
  let fixturesRoot = path.resolve('fixtures');
  let resultsDir = path.resolve('results');

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];

    if (argument === '--model' && next) {
      models.push(next);
      index += 1;
    } else if (argument === '--tasks-dir' && next) {
      tasksRoot = path.resolve(next);
      index += 1;
    } else if (argument === '--fixtures-dir' && next) {
      fixturesRoot = path.resolve(next);
      index += 1;
    } else if (argument === '--results-dir' && next) {
      resultsDir = path.resolve(next);
      index += 1;
    }
  }

  if (models.length === 0) {
    const envModels = process.env.MODELS?.split(',').map((value: string) => value.trim()).filter(Boolean) ?? [];
    models.push(...envModels);
  }

  if (models.length === 0) {
    throw new Error('Provide at least one model with --model or MODELS.');
  }

  return { models, tasksRoot, fixturesRoot, resultsDir };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is required for live evaluation runs.');
  }

  const provider = new OpenRouterProvider({ apiKey });
  const runner = new EvaluationRunner(provider);
  const result = await runner.runSuite(args.models, args.tasksRoot, args.fixturesRoot, args.resultsDir);
  // eslint-disable-next-line no-console
  console.log(`Completed ${result.tasks.length} task runs. Reports written to ${args.resultsDir}`);
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
