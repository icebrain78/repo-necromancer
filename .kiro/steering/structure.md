---
inclusion: always
---
# Structure

```
repo-necromancer/
  .kiro/            steering, specs, hooks (must stay committed - never gitignore)
  apps/web/         Next.js UI (graveyard, autopsy, resurrection views)
  apps/worker/      job runner: clone -> analyze -> sandbox build -> fix loop
  packages/core/    shared types, analyzers, LLM providers, .kiro generators
  fixtures/graves/  small "dead" sample repos used in tests and the demo
```

## Conventions
- One feature = one spec under `.kiro/specs/<feature>/` (requirements.md, design.md, tasks.md), built task by task.
- Shared types live in `packages/core`; apps never import from each other.
- File names kebab-case; React components PascalCase.
- Every generator in `packages/core` has property-based tests.
- Commit messages: imperative, reference the spec task (e.g. `autopsy: task 3 - parse package.json`).
