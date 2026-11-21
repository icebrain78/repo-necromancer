# Implementation Plan: Graveyard

## Overview

Build the Graveyard feature for Repo Necromancer.

## Task Dependency Graph

1->2,3,4,7,8,9; 2+3+4->5; 5->6; all->10; 10->11; 11->12; 1-6->13

## Tasks

- [x] 1. Shared types and project scaffolding
  - Create packages/core/src/types.ts defining RepoStatus RepoSignals TombstoneData
  - Create packages/core/package.json with vitest fast-check devDeps and exports
  - Create packages/core/tsconfig.json strict NodeNext
  - Create apps/web/package.json with next tailwindcss typescript
  - Create apps/web/tsconfig.json strict
  - Create pnpm-workspace.yaml registering apps and packages workspaces

- [x] 2. detect-node (core)
  - Depends on: 1
  - Create packages/core/src/detect-node.ts with isNodeRepo pure function
  - Create packages/core/tests/detect-node.test.ts with unit and property tests

- [x] 3. extract-node-version (core)
  - Depends on: 1
  - Create packages/core/src/extract-node-version.ts with extractNodeVersion pure function
  - Create packages/core/tests/extract-node-version.test.ts with unit and property tests

- [x] 4. resolve-lts-alias (core)
  - Depends on: 1
  - Create packages/core/src/resolve-lts-alias.ts with static LTS lookup table
  - Create packages/core/tests/resolve-lts-alias.test.ts with unit and property tests

- [x] 5. classify-repo (core)
  - Depends on: 1, 2, 3, 4
  - Create packages/core/src/classify-repo.ts with classifyRepo pure function
  - Create packages/core/tests/classify-repo.test.ts with unit and property tests

- [ ] 6. sort-tombstones (core)
  - Depends on: 1, 5
  - Create packages/core/src/sort-tombstones.ts with sortTombstones pure function
  - Create packages/core/tests/sort-tombstones.test.ts with unit and property tests

- [ ] 7. GitHub API client
  - Depends on: 1
  - Create apps/web/lib/github.ts with fetchUserRepos fetchRepo fetchFileContent
  - Create apps/web/lib/errors.ts with RateLimitError NotFoundError GitHubApiError

- [ ] 8. npm registry client
  - Depends on: 1
  - Create apps/web/lib/npm.ts with fetchDeprecatedCount function

- [ ] 9. endoflife.date client
  - Depends on: 1
  - Create apps/web/lib/eol.ts with fetchEolStatus function

- [ ] 10. Graveyard page (server component and data orchestration)
  - Depends on: 1, 2, 3, 4, 5, 6, 7, 8, 9
  - Create apps/web/app/graveyard/page.tsx server component
  - Create apps/web/app/graveyard/loading.tsx skeleton

- [ ] 11. UI components
  - Depends on: 1, 10
  - Create apps/web/components/GraveyardInput.tsx
  - Create apps/web/components/GraveyardGrid.tsx
  - Create apps/web/components/TombstoneCard.tsx
  - Create apps/web/components/StatusBadge.tsx
  - Create apps/web/components/RateLimitError.tsx

- [ ] 12. Landing page and global styles
  - Depends on: 1, 11
  - Create apps/web/app/page.tsx
  - Create apps/web/app/layout.tsx
  - Create apps/web/app/globals.css
  - Create apps/web/tailwind.config.ts

- [ ] 13. End-to-end smoke test with fixture data
  - Depends on: 1, 2, 3, 4, 5, 6
  - Create fixtures/graves/ with Dead Undead and non-Node repo fixtures
  - Create packages/core/tests/graveyard-integration.test.ts

## Notes

- All packages/core functions are pure and covered by fast-check property tests
- TypeScript strict mode no any types
- API clients use revalidate 3600 on every fetch call