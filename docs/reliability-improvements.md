# Reliability Improvements

This document catalogues every known source of unreliability in the harbour-evals harness and the changes needed to address each one. It is grounded in two live runs (Gemini 3.6 Flash: 93.75% / 83.75 avg; Laguna S 2.1: 88% / 80.0 avg) and the issues discovered during iterative development.

---

## 1. Protocol reliability — agent tool-calling format

### 1a. Models diverge from the expected JSON envelope

**Problem.** The harness expects every model turn to be a JSON object with exactly two shapes:
```json
{"action":"tool","tool":"<name>","input":{...}}
{"action":"final","answer":"<string>"}
```
Models trained with different tool-call conventions regularly:
- Use `{"action":"search","query":"..."}` (top-level shorthand, no `tool` key)
- Wrap the object in a markdown fence (` ```json\n{...}\n``` `)
- Prepend explanatory prose before the JSON
- Produce XML: `<tool_call>search<arg_key>query</arg_key><arg_value>...</arg_value></tool_call>`

**Observed impact.** In the Gemini run, 2 of the 11 retries were caused by malformed tool shapes. In the Laguna run, XML/JSON alternation was the single biggest driver of step exhaustion.

**Fixes needed.**
- Extend the system prompt with a concrete worked example for each tool (already partially done; needs a second pass to cover edge-case shapes).
- Add an additional extraction pass that handles `{"action":"<toolname>","query":...}` shorthand so a single malformed step does not consume a retry.
- Log the exact rejected string to `transcripts.json` alongside the retry message so problems are visible without re-running.

---

### 1b. Tool-call limit triggers before required tool is used

**Problem.** The `research-001-basic` task requires both `search` and `documentation`, but `max_tool_calls: 4` is exactly the number of tools the model needs in the happy path. When the first call is malformed (wasting 1 of 4 permitted calls), the model hits the limit before reaching the documentation call.

**Observed impact.** `research-001-basic` failed (40/100) in the Gemini run because the model never successfully called `documentation` or `search`.

**Fixes needed.**
- Audit every task and ensure `max_tool_calls` is at least `happy-path calls + 1` to absorb one wasted step.
- Consider distinguishing between *failed* tool calls (bad input → error returned) and *invalid* tool calls (unparseable format → retry) when counting toward the limit. Only valid calls that return data should count.

---

## 2. Scoring reliability — checks are too narrow or too broad

### 2a. `documentation_cited` requires an exact marker string in the final answer

**Problem.** The check type `documentation_cited` tests whether the model's answer includes a literal string like `[docs:prisma-relation-mode]`. No model produces this unprompted — it has to read the documentation fixture, see the marker, and copy it verbatim into its answer. A single missed `documentation` call means the check always fails.

**Observed impact.** `research-001-basic` failed the `references_correct_documentation` check in the Gemini run even though the model gave a correct and detailed explanation of `relationMode`.

**Fixes needed.**
- Add the marker string to the fixture doc and also include it in the *task prompt* as a formatting instruction: "Include the documentation reference marker exactly as shown in the result."
- Alternatively, replace `documentation_cited` with a `contains_any` check on a set of phrases that a well-formed answer would include without needing to cite a marker (e.g. "emulate", "foreign key", "prisma client layer"). Only keep `documentation_cited` when verifying that the model actually retrieved and cited a source.

---

### 2b. Optional checks inflate or obscure the score

**Problem.** When optional checks are `tool_called` checks and the model happens to call the tool for a reason other than the task intent, it scores the optional point even without correctly using the tool output. Conversely, when the model answers correctly but via a different tool path, it loses the optional point.

**Observed impact.** `design-001-basic` and `plan-001-basic` both scored 80 because `uses_documentation` (optional) was not satisfied — the model answered correctly without the tool and did not lose the required checks. This is arguably correct, but it makes the score less informative.

**Fixes needed.**
- Reserve `tool_called` optional checks for tasks where tool use is genuinely part of the skill being tested. Rename them `uses_<tool>_for_research` and pair with a `contains` check on content that can only come from that tool.
- Consider a new check type `tool_called_with_result_used` that verifies both that a tool was called *and* that the answer contains text from the fixture the tool would return.

---

### 2c. `contains` checks are sensitive to phrasing

**Problem.** Required checks like `contains: "validation middleware"` fail when the model writes "validation" and "middleware" in separate sentences. This has been partly addressed by switching to `contains_all`, but similar fragility exists elsewhere.

**Fixes needed.**
- Audit all `contains` checks and replace single-phrase checks with `contains_all` where two concepts are expected (e.g., `["tests", "validation"]`).
- For numerical or technical assertions, consider `contains_any` with 3–5 semantically equivalent phrasings.
- Add a `regex` check type so tasks can specify patterns like `\bsrc/server\.ts\b` rather than exact strings that depend on the model including a path in a specific format.

---

## 3. Task design reliability

### 3a. Prompts do not consistently guide tool use

**Problem.** Several tasks expect the model to call a specific tool but do not explicitly say to do so. When the model can answer from prior knowledge without tool calls, it often does — and then misses tool-based checks.

**Observed impact.** `plan-001-basic` and `design-001-basic` both missed `uses_documentation`; `autopilot-meta-001-basic` did not find useful search results and wasted a tool-call slot. The `retro` and `review` prompts (since fixed) originally led to 0-score runs because the model did not engage with tools at all.

**Fixes needed.**
- Add a "Required steps:" block to every task prompt that names the tools the model should use: e.g. "You must use the filesystem tool to inspect the code and the documentation tool to look up the relevant standard."
- For tasks that require documentation citation, include the expected citation marker in the prompt as an explicit formatting instruction.
- For tasks where tool use is optional (scored as optional), clearly distinguish: "You may optionally consult the documentation tool."

---

### 3b. Fixture coverage for search/documentation is incomplete

**Problem.** Tool responses are fixture-backed: if no fixture file matches the slugified query, `search` returns empty results and `documentation` returns empty content. Models vary their query phrasing, so they frequently miss the fixture.

**Observed impact.** Multiple search variants for `relationMode` were missing before the Laguna run. The model sent queries that did not slug-match any existing file, got empty results, and concluded there was no relevant documentation.

**Fixes needed.**
- For every task that expects a tool to return meaningful content, list the expected query strings in `task.yaml` or a companion file. Run a fixture-coverage check in CI that verifies each expected query slug exists.
- Add fixture files for common query variants (already partially done; should be automated).
- Consider a fuzzy-match fallback in `SearchTool` and `DocumentationTool` that matches the fixture file whose slug has the highest character overlap with the incoming query slug. This reduces brittleness without requiring manual fixture enumeration.

---

### 3c. Fixture data does not always surface the required information

**Problem.** Some fixtures provide information only indirectly. The `review` git diff fixture did not include a filename header at the `@@` hunk level, so the model correctly read the diff but could not cite `src/server.ts`. The `bug` task requires navigating a directory tree before the relevant file is in context, consuming all tool calls on navigation.

**Fixes needed.**
- Ensure git diff fixtures include a complete unified-diff header (`diff --git a/... b/...`) and `@@` hunk lines with function context. Do not truncate fixture diffs to just the hunk body.
- Add a `context.md` or `hint.md` fixture file to tasks where directory navigation is expensive (bug, implementation), and reference it from the task prompt so the model can get its bearings with one read.

---

## 4. Runner reliability

### 4a. Step and tool limits are not differentiated

**Problem.** `max_steps` and `max_tool_calls` are separate limits, but they interact in a confusing way. A step that produces an invalid JSON response counts toward `max_steps` but not `max_tool_calls`. A step that hits the tool limit produces a retry prompt that also counts toward `max_steps`. Under tight limits, the model can exhaust steps entirely in retry loops.

**Fixes needed.**
- Track `retrySteps` separately and do not count them against `max_steps`. Only productive steps (successful tool calls or valid final answers) should consume the step budget.
- Alternatively, remove `max_steps` as a separate limit and keep only `max_tool_calls` plus a separate `max_retries` cap (e.g. 3).

---

### 4b. No structured logging of retry reasons

**Problem.** The transcript captures all messages, but there is no structured field that records why each retry happened (invalid JSON, wrong tool, tool limit, timeout). Post-run analysis requires scanning transcript text for the retry message strings.

**Fixes needed.**
- Add a `retryLog: Array<{step: number; reason: 'invalid_json' | 'unknown_tool' | 'tool_limit' | 'timeout'}>` field to `TaskRunResult`.
- Surface this in the JSON and CSV reports so reliability analysis across runs is straightforward.

---

### 4c. Timeouts are not surfaced in reports

**Problem.** When a task times out (the deadline is exceeded before a final answer is produced), the task records `"No final answer produced."` and scores 0. There is no flag in the report indicating the task timed out vs. produced an answer that failed scoring.

**Fixes needed.**
- Add a `timedOut: boolean` field to `TaskRunResult`.
- Distinguish timeout failures from scoring failures in the Markdown report.

---

### 4d. Costs are not reported for all providers

**Problem.** `estimatedCost` in `TaskRunResult` is populated from `usage.total_cost` in the OpenRouter API response. Many models (including all free-tier models in the Gemini and Laguna runs) return `0` for cost. This makes the cost column in the CSV report meaningless for free models.

**Fixes needed.**
- If `total_cost` is 0, attempt to compute an estimated cost from `prompt_tokens × input_price + completion_tokens × output_price` using OpenRouter's published per-token rates (fetchable from `https://openrouter.ai/api/v1/models`).
- Cache the model pricing at the start of each suite run to avoid per-task fetches.

---

## 5. Multi-run and statistical reliability

### 5a. Single runs are not statistically meaningful

**Problem.** Model outputs vary even at `temperature: 0` due to non-determinism in GPU floating-point and batch scheduling. A single run per task can differ by 20+ points from the next run on the same task.

**Observed evidence.** `plan-001-basic` scored 80 in a single-task smoke test but 0 in the first full sweep. `poolside/laguna-s-2.1:free` showed high variability across successive runs.

**Fixes needed.**
- Add a `--runs N` CLI flag that repeats each task N times and reports mean ± stddev.
- Update `SuiteRunResult` and all report formats to include per-task run distributions, not just a single score.
- Set a recommended minimum of 3 runs per task for any report intended for comparison.

---

### 5b. No baseline or regression comparison

**Problem.** There is no automated mechanism to compare a new run against a saved baseline. A harness change that improves one task but regresses another would not be detected until reports were manually inspected.

**Fixes needed.**
- Add a `--compare <path>` CLI flag that compares a new `report.json` against a saved one and prints a per-task delta table.
- In CI, save the latest passing run as a reference artifact and run the comparison automatically.

---

## 6. Provider reliability

### 6a. Only one provider adapter exists

**Problem.** All evaluations route through OpenRouter. If OpenRouter is unavailable, the entire harness is blocked. Additionally, OpenRouter's aggregation layer adds latency and introduces an extra point of failure.

**Fixes needed.**
- Implement a second provider adapter (e.g. direct Anthropic or OpenAI client) so runs can be executed without OpenRouter.
- Document which adapter to use for reproducible results (direct APIs offer stronger determinism guarantees).

---

### 6b. Free-tier model availability is unstable

**Problem.** Free-tier model availability on OpenRouter changes without notice. Models that worked last week may return 429s this week. The `running-evals.md` document already notes this; the harness does not handle it gracefully — a 429 after retries marks the task as failed with "No final answer produced."

**Fixes needed.**
- Add a `--dry-run` flag that sends a single minimal request per model to verify availability before running the full suite.
- If all retries are exhausted due to rate-limiting, mark the task `skipped` rather than `failed` so it is distinguishable in reports.

---

## 7. CI and reproducibility

### 7a. Live runs are not in CI

**Problem.** `npm run check` runs the unit tests only, which use stub providers. There is no CI job that validates the harness against a real model. Regressions in prompts, expected checks, or fixtures are only discovered on manual live runs.

**Fixes needed.**
- Add an optional CI workflow (triggered manually or on a schedule, not on every push) that runs the full suite against a single cheap model (e.g. `google/gemini-3.6-flash`) and asserts `pass_rate >= 90%`.
- Store the result artifact for trend comparison.

---

### 7b. No fixture integrity checks

**Problem.** There are no automated checks that verify:
- All fixture files referenced in `task.yaml` exist
- All expected query slugs have a corresponding fixture file
- All `documentation_cited` markers appear in a doc fixture

**Fixes needed.**
- Add a `npm run lint:tasks` script (or a test suite in `test/`) that loads all task definitions and validates fixture coverage without making any API calls.
- Run this in `npm run check` so fixture gaps are caught locally.

---

## Priority order

| Priority | Item | Effort |
|----------|------|--------|
| High | 1b — raise `max_tool_calls` to absorb one wasted step per task | Low |
| High | 2a — add citation marker to task prompt | Low |
| High | 3a — add "Required steps" guidance to every prompt | Low |
| High | 3b — fixture coverage check in CI | Medium |
| High | 4a — decouple retry steps from `max_steps` | Medium |
| Medium | 1a — extend JSON extraction to cover shorthand tool shapes | Low |
| Medium | 2c — audit and widen narrow `contains` checks | Low |
| Medium | 3c — fix fixture data gaps (diff headers, context hints) | Low |
| Medium | 4b — add structured `retryLog` to task results | Low |
| Medium | 5a — add `--runs N` for statistical averaging | Medium |
| Medium | 7a — optional CI live-eval workflow | Medium |
| Low | 2b — add `tool_called_with_result_used` check type | Medium |
| Low | 3b — fuzzy match fallback in search/doc tools | Medium |
| Low | 4c — timedOut flag in reports | Low |
| Low | 4d — estimated cost from token counts | Low |
| Low | 5b — `--compare` baseline diffing | Medium |
| Low | 6a — second provider adapter | High |
| Low | 6b — dry-run flag + skip vs fail on rate limit | Low |
| Low | 7b — `npm run lint:tasks` fixture integrity check | Medium |
