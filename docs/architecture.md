# Architecture

## Flow

1. Load all task directories from `/tasks`
2. Resolve the referenced fixture from `/fixtures`
3. Create only the tools declared by the task
4. Run a bounded agent loop through the provider adapter
5. Capture transcript, tool usage, timing, and token metrics
6. Score the final answer deterministically
7. Write Markdown, JSON, CSV, and transcript outputs to `/results`

## Components

- `src/task-loader.ts` discovers and parses file-based task definitions
- `src/runner.ts` executes the provider loop with tool limits and timeouts
- `src/scorer.ts` applies deterministic checks from `expected.yaml`
- `src/report.ts` writes Markdown, JSON, CSV, and transcript outputs
- `providers/openrouter.ts` adapts OpenRouter chat completions
- `tools/*.ts` provide configurable filesystem, search, documentation, terminal, and git interfaces

## Determinism

- Search and documentation lookups are fixture-backed
- Git responses are stubbed from fixture files
- The provider request uses temperature `0`
- Tool availability is task-scoped and fixed by configuration

## Extension points

- Add a provider by implementing the `ProviderAdapter` interface
- Add a tool by implementing the `Tool` interface and registering it
- Add a task by creating a new task directory with config, prompt, and expected outcome files
