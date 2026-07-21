# MVP implementation plan

## Scope

Build a minimal Harbour agent evaluation harness that can load file-based tasks, execute them against a provider through a small tool harness, score outcomes deterministically, and write reports.

## Checklist

- [ ] Establish project tooling and TypeScript build/test scripts
- [ ] Implement task and fixture loading from directories
- [ ] Implement OpenRouter provider adapter
- [ ] Implement configurable stub tools
- [ ] Implement runner, scoring, transcript capture, and metrics
- [ ] Implement Markdown, JSON, and CSV reports
- [ ] Add required task-type directories and seed MVP tasks
- [ ] Add focused automated tests
- [ ] Run validation and manual smoke evaluation

## Notes

- Keep the system deterministic by using fixture-backed tool responses
- Prefer configuration-driven task loading over hardcoded task registration
- Keep provider and tool contracts small so future adapters can be added without redesign
