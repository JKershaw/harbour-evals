# Cheap Model Benchmark Report

**Date:** 2026-07-21  
**Harness:** `harbour-evals`  
**Provider:** OpenRouter

## Scope

Ran the full 16-task benchmark on a few low-cost models after reviewing `/home/runner/work/harbour-evals/harbour-evals/docs/running-evals.md`.

Successful full-suite runs:

- `poolside/laguna-s-2.1:free`
- `openai/gpt-5-mini`
- `google/gemini-3.6-flash`

Attempted but not included in final comparison:

- `nvidia/nemotron-3-super-120b-a12b:free` (run exceeded practical time window)
- `cohere/north-mini-code:free` (run exceeded practical time window)
- `openai/gpt-oss-20b:free` (empty-content response from provider)

## Commands Used

```bash
npm run check
TASK_DELAY_MS=12000 npm run evaluate -- --model poolside/laguna-s-2.1:free --results-dir /tmp/bench-laguna
TASK_DELAY_MS=4000 npm run evaluate -- --model openai/gpt-5-mini --results-dir /tmp/bench-gpt5mini
TASK_DELAY_MS=4000 npm run evaluate -- --model google/gemini-3.6-flash --results-dir /tmp/bench-gemini36flash
```

## Overall Results

| Model | Pass rate | Avg score | Total run duration | Tool calls | Retries |
| --- | ---: | ---: | ---: | ---: | ---: |
| `google/gemini-3.6-flash` | **14 / 16** | **81.25** | **99.1s** | 63 | 11 |
| `poolside/laguna-s-2.1:free` | 13 / 16 | 77.50 | 283.5s | 60 | 18 |
| `openai/gpt-5-mini` | 11 / 16 | 73.75 | 312.7s | 44 | 11 |

Result directories:

- `/tmp/bench-laguna/2026-07-21T20-45-03-600Z`
- `/tmp/bench-gpt5mini/2026-07-21T21-00-21-197Z`
- `/tmp/bench-gemini36flash/2026-07-21T21-03-03-745Z`

## Agent Performance Review

### Common strengths

- All three models were strong on structured tasks (`blocked`, `breakdown`, `close-out`, `implementation`, `plan`, `scoping`, `spike`, `triage`) with mostly 80+ scores.
- All three consistently hit 100 on `blocked-001-basic`.
- Tool-using behavior was generally reliable across successful runs (44–63 tool calls over 16 tasks).

### Common weaknesses

- `review-001-basic` failed for all three models (60), missing required filename mention (`src/server.ts`).
- `research-001-basic` failed for all three models (60), missing the required documentation citation check.
- These two failures are benchmark-fragility hotspots rather than clear model-quality separation.

### Model-specific notes

- **Gemini 3.6 Flash**: Best combined quality/speed; only failed the two known fragile tasks.
- **Laguna S 2.1 Free**: Good performance but slower and retry-heavy; additionally failed `bug-001-basic`.
- **GPT-5 Mini**: Lowest pass rate in this run set; additional misses on `context-001-basic` and `design-001-basic`.

## Key Takeaways

1. For low-cost live regression runs, `google/gemini-3.6-flash` currently gives the best throughput and pass rate.
2. `poolside/laguna-s-2.1:free` remains viable for free-tier checks but is less efficient and less stable.
3. Current benchmark discriminates poorly on `review` and `research` due to strict required checks that all models miss.

## Recommended Next Steps

1. Keep using `gemini-3.6-flash` as the default cheap benchmark model.
2. Revisit `review-001-basic` expected logic (path mention requirement) to better reflect realistic good answers.
3. Revisit `research-001-basic` required citation criteria to reduce false-negative failures.
4. If you need higher confidence model ranking, run each model for 3 trials and compare mean/stdev.
