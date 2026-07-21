# Running Evals — Environment Notes

This document captures what we learned about running harbour-evals in a Copilot cloud-agent environment (GitHub Actions runner). It covers network access, provider behaviour, rate limits, and recommendations for future runs.

## Environment

- Node.js v22 (ships with native `fetch` — no extra HTTP library needed)
- `OPENROUTER_API_KEY` is injected automatically when configured in the environment
- Outbound HTTPS to `openrouter.ai` is available and fast (< 60 ms TTFB from this runner)

## Quick-start

```bash
npm install
OPENROUTER_API_KEY=<key> npm run evaluate -- --model <model-id>
```

Reports are written to `results/` by default (`report.md`, `report.json`, `report.csv`, `transcripts.json`).

## Choosing a Free-tier Model

OpenRouter exposes free-tier models at `https://openrouter.ai/api/v1/models` — their IDs end with `:free`.

As of July 2026, the models available via the free tier in this environment were:

| Model | Status |
| --- | --- |
| `poolside/laguna-s-2.1:free` | ✅ Works — best overall quality |
| `nvidia/nemotron-3-super-120b-a12b:free` | ⚠️ Works for single tasks; too slow for unthrottled sweeps |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | ⚠️ Upstream resource exhaustion errors |
| `cohere/north-mini-code:free` | ⚠️ HTTP 200 but empty message content |
| `poolside/laguna-m.1:free` | ❌ Consistent 429 |
| `google/gemma-4-31b-it:free` | ❌ Consistent 429 |
| `openai/gpt-oss-20b:free` | ❌ Returns empty content |

**Recommendation:** use `poolside/laguna-s-2.1:free` for validation runs.

## Rate Limits and Pacing

Free-tier models on OpenRouter enforce a per-minute request cap (`free-models-per-min`). Running 16 tasks back-to-back without any delay triggers 429s on almost every task after the first.

The runner supports an inter-task delay via the `TASK_DELAY_MS` environment variable:

```bash
TASK_DELAY_MS=12000 OPENROUTER_API_KEY=<key> npm run evaluate -- --model poolside/laguna-s-2.1:free
```

With 12-second inter-task gaps the full 16-task suite completes in roughly 5 minutes without hitting rate limits.

The provider adapter (`providers/openrouter.ts`) also retries automatically:
- HTTP 429 and 5xx responses are retried up to 4 times with exponential backoff (1 s → 2 s → 4 s → 8 s), capped at 60 s
- Responses with an empty `choices[0].message.content` are treated as transient and retried on the same schedule
- A `Retry-After` header (if returned by OpenRouter) overrides the calculated backoff

## First Full Sweep Results (2026-07-21)

Model: `poolside/laguna-s-2.1:free`  
Tasks: 16 / 16 completed  
Pass rate: 9 / 16 (56%)  
Average score: 52.5 / 100

| Task | Score | Passed |
| --- | ---: | :---: |
| autopilot-meta-001-basic | 80 | ✓ |
| blocked-001-basic | 100 | ✓ |
| breakdown-001-basic | 80 | ✓ |
| bug-001-basic | 60 | ✗ |
| close-out-001-basic | 80 | ✓ |
| context-001-basic | 80 | ✓ |
| design-001-basic | 0 | ✗ |
| implementation-001-basic | 80 | ✓ |
| look-into-001-basic | 20 | ✗ |
| plan-001-basic | 0 | ✗ |
| research-001-basic | 20 | ✗ |
| retro-001-basic | 0 | ✗ |
| review-001-basic | 0 | ✗ |
| scoping-001-basic | 80 | ✓ |
| spike-001-basic | 80 | ✓ |
| triage-001-basic | 80 | ✓ |

The model handles structured-output tasks well (blocked, context, triage, scoping) but struggles with open-ended analytical tasks (retro, review, plan, design) where zero tool calls were made.

## Observations

- Tasks with zero tool calls (`retro`, `review`) score 0. This suggests the model did not engage with available tools when the prompt did not signal an obvious information need.
- The `plan-001-basic` task scored 0 in the full sweep but 80 in an earlier single-task smoke test. Variability is likely due to minor prompt sensitivity — worth investigating with more runs.
- All 16 tasks completed, with each completing within its 120-second timeout.
- Total wall-clock time: ~5 minutes with 12-second inter-task delays.

## Useful Commands

```bash
# Validate the harness (build + unit tests, no network required)
npm run check

# Single-task smoke test (fast, confirms API key + network)
OPENROUTER_API_KEY=<key> npm run evaluate -- \
  --model poolside/laguna-s-2.1:free \
  --tasks-dir /tmp/smoke/tasks \
  --results-dir /tmp/smoke/results

# Full suite with pacing (recommended for free-tier models)
TASK_DELAY_MS=12000 OPENROUTER_API_KEY=<key> npm run evaluate -- \
  --model poolside/laguna-s-2.1:free

# Full suite writing results elsewhere
TASK_DELAY_MS=12000 OPENROUTER_API_KEY=<key> npm run evaluate -- \
  --model poolside/laguna-s-2.1:free \
  --results-dir /path/to/output
```
