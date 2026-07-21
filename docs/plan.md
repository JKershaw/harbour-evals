# MVP implementation plan

## Scope

Build a minimal Harbour agent evaluation harness that can load file-based tasks, execute them against a provider through a small tool harness, score outcomes deterministically, and write reports.

## Checklist

- [x] Establish project tooling and TypeScript build/test scripts
- [x] Implement task and fixture loading from directories
- [x] Implement OpenRouter provider adapter
- [x] Implement configurable stub tools
- [x] Implement runner, scoring, transcript capture, and metrics
- [x] Implement Markdown, JSON, and CSV reports
- [x] Add required task-type directories and seed MVP tasks
- [x] Add focused automated tests
- [ ] Run validation and manual smoke evaluation

## Notes

- Keep the system deterministic by using fixture-backed tool responses
- Prefer configuration-driven task loading over hardcoded task registration
- Keep provider and tool contracts small so future adapters can be added without redesign
