import fs from 'node:fs/promises';
import path from 'node:path';
import type { LoadedTask, ScoringCheck, ScoreBreakdownItem, TaskRunResult, TaskScore, ToolCallRecord } from './types.js';
import { normalizeText } from './utils.js';

function normalizeCheck(raw: ScoringCheck | string): ScoringCheck {
  if (typeof raw === 'string') {
    return {
      id: raw,
      type: 'contains',
      value: raw.replaceAll('_', ' ')
    };
  }

  return raw;
}

async function evaluateCheck(check: ScoringCheck, answer: string, toolCalls: ToolCallRecord[], fixtureDir: string): Promise<boolean> {
  const normalizedAnswer = normalizeText(answer);

  switch (check.type) {
    case 'contains':
      return Boolean(check.value && normalizedAnswer.includes(normalizeText(check.value)));
    case 'contains_any':
      return Boolean(check.values?.some((value) => normalizedAnswer.includes(normalizeText(value))));
    case 'contains_all':
      return Boolean(check.values?.every((value) => normalizedAnswer.includes(normalizeText(value))));
    case 'tool_called':
      return Boolean(check.value && toolCalls.some((toolCall) => toolCall.tool === check.value));
    case 'documentation_cited':
      return Boolean(check.values?.some((value) => answer.includes(value)));
    case 'file_exists': {
      if (!check.value) {
        return false;
      }
      try {
        await fs.access(path.join(fixtureDir, check.value));
        return true;
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

export async function scoreTask(task: LoadedTask, answer: string, toolCalls: ToolCallRecord[]): Promise<TaskScore> {
  const required = (task.expected.required ?? []).map(normalizeCheck);
  const optional = (task.expected.optional ?? []).map(normalizeCheck);
  const requiredWeight = task.expected.score?.required_weight ?? 80;
  const optionalWeight = task.expected.score?.optional_weight ?? 20;
  const passThreshold = task.expected.score?.pass_threshold ?? 70;
  const breakdown: ScoreBreakdownItem[] = [];

  let score = 0;
  let requiredPassed = 0;

  for (const check of required) {
    const passed = await evaluateCheck(check, answer, toolCalls, task.fixtureDir);
    breakdown.push({ id: check.id, passed, tier: 'required' });
    if (passed) {
      requiredPassed += 1;
      score += required.length > 0 ? requiredWeight / required.length : 0;
    }
  }

  for (const check of optional) {
    const passed = await evaluateCheck(check, answer, toolCalls, task.fixtureDir);
    breakdown.push({ id: check.id, passed, tier: 'optional' });
    if (passed) {
      score += optional.length > 0 ? optionalWeight / optional.length : 0;
    }
  }

  const roundedScore = Math.round(score * 100) / 100;
  return {
    score: roundedScore,
    passed: requiredPassed === required.length && roundedScore >= passThreshold,
    breakdown
  };
}

export function summarizeByType(results: TaskRunResult[]): Map<string, number> {
  const grouped = new Map<string, number[]>();

  for (const result of results) {
    const existing = grouped.get(result.taskType) ?? [];
    existing.push(result.score);
    grouped.set(result.taskType, existing);
  }

  return new Map(
    Array.from(grouped.entries()).map(([taskType, scores]) => [taskType, Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 100) / 100])
  );
}
