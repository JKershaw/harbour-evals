import fs from 'node:fs/promises';
import path from 'node:path';
import type { SuiteRunResult, TaskRunResult } from './types.js';
import { summarizeByType } from './scorer.js';

function csvEscape(value: string | number | boolean): string {
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
}

function modelTypeSummaries(results: TaskRunResult[]): Map<string, Map<string, number>> {
  const summaries = new Map<string, Map<string, number>>();

  for (const model of [...new Set(results.map((result) => result.model))]) {
    const modelResults = results.filter((result) => result.model === model);
    summaries.set(model, summarizeByType(modelResults));
  }

  return summaries;
}

export function buildMarkdownReport(run: SuiteRunResult): string {
  const taskTypes = [...new Set(run.tasks.map((task) => task.taskType))].sort();
  const lines = ['# Harbour Evals Report', '', `Generated: ${run.generatedAt}`, '', `Provider: ${run.provider}`, ''];
  lines.push(`| Model | ${taskTypes.join(' | ')} |`);
  lines.push(`| --- | ${taskTypes.map(() => '---').join(' | ')} |`);

  for (const [model, summary] of modelTypeSummaries(run.tasks)) {
    lines.push(`| ${model} | ${taskTypes.map((taskType) => summary.get(taskType)?.toFixed(2) ?? '-').join(' | ')} |`);
  }

  lines.push('', '## Task details', '');
  for (const task of run.tasks) {
    lines.push(`- ${task.model} / ${task.taskId}: ${task.score.toFixed(2)} (${task.passed ? 'pass' : 'fail'})`);
  }

  return `${lines.join('\n')}\n`;
}

export function buildCsvReport(run: SuiteRunResult): string {
  const header = ['model', 'task_id', 'task_type', 'score', 'passed', 'duration_ms', 'prompt_tokens', 'completion_tokens', 'estimated_cost', 'tool_calls', 'failed_tool_calls', 'retries'];
  const rows = run.tasks.map((task) => [
    task.model,
    task.taskId,
    task.taskType,
    task.score,
    task.passed,
    task.durationMs,
    task.promptTokens,
    task.completionTokens,
    task.estimatedCost,
    task.toolCalls,
    task.failedToolCalls,
    task.retries
  ]);

  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n').concat('\n');
}

export async function writeReports(resultsDir: string, run: SuiteRunResult): Promise<string> {
  const runDir = path.join(resultsDir, run.generatedAt.replace(/[:.]/g, '-'));
  await fs.mkdir(runDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(runDir, 'report.md'), buildMarkdownReport(run), 'utf8'),
    fs.writeFile(path.join(runDir, 'report.json'), JSON.stringify(run, null, 2), 'utf8'),
    fs.writeFile(path.join(runDir, 'report.csv'), buildCsvReport(run), 'utf8'),
    fs.writeFile(path.join(runDir, 'transcripts.json'), JSON.stringify(run.tasks.map((task) => ({ taskId: task.taskId, model: task.model, transcript: task.transcript, answer: task.answer, breakdown: task.breakdown })), null, 2), 'utf8')
  ]);
  return runDir;
}
