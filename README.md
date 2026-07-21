# harbour-evals

Lightweight evaluation harness for measuring how well different LLMs perform Harbour-style software engineering roles.

## MVP goals

- Evaluate role-specific tasks rather than general coding ability
- Keep runs deterministic and inexpensive
- Add tasks by creating task directories instead of changing code
- Support model providers through adapters
- Configure agent tools per task
- Emit machine-readable and human-readable reports

## Planned MVP scope

- OpenRouter provider adapter
- One fixture repository
- Stubbed filesystem, search, documentation, terminal, and git tools
- Five simple evaluation tasks
- Deterministic scoring with optional transcript capture
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

See `/home/runner/work/harbour-evals/harbour-evals/docs/plan.md` for the current implementation checklist.