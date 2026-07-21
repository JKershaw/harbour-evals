# harbour-evals

Lightweight evaluation harness for measuring how well different LLMs perform Harbour-style software engineering roles.

## MVP goals

- Evaluate role-specific tasks rather than general coding ability
- Keep runs deterministic and inexpensive
- Add tasks by creating task directories instead of changing code
- Support model providers through adapters
- Configure agent tools per task
- Emit machine-readable and human-readable reports

## Implemented MVP scope

- OpenRouter provider adapter
- One fixture repository
- Configurable filesystem, search, documentation, terminal, and git tools
- Seed task directories for Harbour task types
- Deterministic scoring with transcript capture
- Markdown, JSON, and CSV reports

## Repository layout

This repository will contain:

- `/src` core runner, scoring, and report logic
- `/providers` model provider adapters
- `/tools` harness tool implementations
- `/tasks` role-oriented evaluation tasks
- `/fixtures` deterministic fixture data
- `/results` generated evaluation output
- `/docs` planning and architecture notes

## Usage

Install dependencies:

```bash
npm install
```

Run validation:

```bash
npm run check
```

Run an evaluation against OpenRouter:

```bash
OPENROUTER_API_KEY=... npm run evaluate -- --model openai/gpt-5-mini
```

Reports are written to `/home/runner/work/harbour-evals/harbour-evals/results` by default:

- `report.md`
- `report.json`
- `report.csv`
- `transcripts.json`

## Task format

Each task is added as a directory with:

- `task.yaml`
- `prompt.md`
- `expected.yaml`

The loader discovers tasks automatically from `/tasks/<type>/<task-id>/`, so adding a task does not require code changes.

Tasks can use either:

- `fixture: "<fixture-name>"` for deterministic local fixture runs
- `scenario:` with `repository` + `commit` (+ optional `subdir`) to materialize a real repo snapshot into a local cache for evaluation

Example scenario source in `task.yaml`:

```yaml
id: "review-001-real"
type: "review"
scenario:
  repository: "https://github.com/org/project.git"
  commit: "abc123def456"
  subdir: "packages/api"
tools: ["filesystem", "git"]
```

See `/home/runner/work/harbour-evals/harbour-evals/docs/plan.md` for the current checklist and `/home/runner/work/harbour-evals/harbour-evals/docs/architecture.md` for the runtime design.