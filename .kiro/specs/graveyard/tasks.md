# Graveyard – Tasks

Tasks are ordered by dependency. Each task references the requirements and design sections it implements.

---

## Task 1 – Shared types and project scaffolding

**Goal:** Establish the TypeScript foundation that all later tasks depend on.

**Files to create/modify:**
- `packages/core/src/types.ts` — define `RepoStatus`, `RepoSignals`, `TombstoneData`
- `packages/core/package.json` — add `vitest` and `fast-check` dev dependencies; configure `exports`
- `packages/core/tsconfig.json` — strict mode, `NodeNext` module resolution
- `apps/web/package.json` — add `next`, `tailwindcss`, `typescript`
- `apps/web/tsconfig.json` — strict mode
- Root `pnpm-workspace.yaml` (if absent) — register `apps/*` and `packages/*`

**Acceptance criteria:**
- `pnpm tsc --noEmit` passes in both `packages/core` and `apps/web` with no errors.
- `TombstoneData`, `RepoSignals`, and `RepoStatus` are importable from `@repo-necromancer/core`.
- `RepoSignals` includes an `archived: boolean` field.
- `TombstoneData` includes an `archived: boolean` field.

**References:** design `types.ts`, structure steering.

---

## Task 2 – `detect-node` (core)

**Goal:** Pure function + property tests for Node.js repo detection.

**Files to create:**
- `packages/core/src/detect-node.ts`
- `packages/core/tests/detect-node.test.ts`

**Acceptance criteria:**
- `isNodeRepo('JavaScript', false)` → `true`
- `isNodeRepo('TypeScript', false)` → `true`
- `isNodeRepo('Python', false)` → `false`
- `isNodeRepo('Python', true)` → `true`
- `isNodeRepo(null, false)` → `false`
- Property test: for any `(language, hasPackageJson)` pair, result is `true` iff language is JS/TS or hasPackageJson is true.
- `pnpm test` passes in `packages/core`.

**References:** REQ-3, design `detect-node.ts`.

---

## Task 3 – `extract-node-version` (core)

**Goal:** Pure function + property tests for extracting a Node.js major version string.

**Files to create:**
- `packages/core/src/extract-node-version.ts`
- `packages/core/tests/extract-node-version.test.ts`

**Acceptance criteria:**
- `extractNodeVersion('>=16.0.0 <18', undefined)` → `'16'`
- `extractNodeVersion('^18.12.0', undefined)` → `'18'`
- `extractNodeVersion(undefined, '20\n')` → `'20'`
- `extractNodeVersion(undefined, 'v14.17.0')` → `'14'`
- `extractNodeVersion(undefined, undefined)` → `null`
- `extractNodeVersion('*', undefined)` → `null`
- Property test: output is either a string of digits or `null`.
- `pnpm test` passes.

**References:** REQ-5.1, REQ-5.2, design `extract-node-version.ts`.

---

## Task 4 – `resolve-lts-alias` (core)

**Goal:** Static LTS alias lookup table + property tests.

**Files to create:**
- `packages/core/src/resolve-lts-alias.ts`
- `packages/core/tests/resolve-lts-alias.test.ts`

**Acceptance criteria:**
- `resolveLtsAlias('lts/gallium')` → `16`
- `resolveLtsAlias('lts/hydrogen')` → `18`
- `resolveLtsAlias('LTS/IRON')` → `20` (case-insensitive)
- `resolveLtsAlias('lts/unknown-name')` → `null`
- `resolveLtsAlias('18')` → `null` (numeric strings are not aliases)
- All 10 known aliases resolve correctly (argon→4 through jod→22).
- Property test: arbitrary string not in table → `null`.
- `pnpm test` passes.

**References:** REQ-5.2, design `resolve-lts-alias.ts`.

---

## Task 5 – `classify-repo` (core)

**Goal:** Pure status classification function + property tests.

**Files to create:**
- `packages/core/src/classify-repo.ts`
- `packages/core/tests/classify-repo.test.ts`

**Acceptance criteria:**
- `classifyRepo({ isNodeRepo: false, ... })` → `'UnknownSpecies'` regardless of other signals.
- `classifyRepo({ isNodeRepo: true, archived: true, pushedAt: <1 year ago>, deprecatedDepCount: 0, nodeVersionEol: false })` → `'Dead'` (archived triggers Dead).
- `classifyRepo({ isNodeRepo: true, archived: false, pushedAt: <3+ years ago>, deprecatedDepCount: 0, nodeVersionEol: false })` → `'Dead'` (stale triggers Dead).
- `classifyRepo({ isNodeRepo: true, archived: false, pushedAt: <1 year ago>, deprecatedDepCount: 5, nodeVersionEol: false })` → `'Dead'` (deprecated deps trigger Dead).
- `classifyRepo({ isNodeRepo: true, archived: false, pushedAt: <1 year ago>, deprecatedDepCount: 0, nodeVersionEol: true })` → `'Dead'` (EOL runtime triggers Dead).
- `classifyRepo({ isNodeRepo: true, archived: false, pushedAt: <1 year ago>, deprecatedDepCount: 0, nodeVersionEol: false })` → `'Undead'` (all signals known and benign).
- `classifyRepo({ isNodeRepo: true, archived: false, pushedAt: <1 year ago>, deprecatedDepCount: null, nodeVersionEol: null })` → `'Unknown'` (no trigger fires, but signals are unknown).
- `classifyRepo({ isNodeRepo: true, archived: false, pushedAt: <1 year ago>, deprecatedDepCount: 0, nodeVersionEol: null })` → `'Unknown'` (benign known signals, one unknown).
- Property test: `'UnknownSpecies'` only when `isNodeRepo` is false. `'Dead'` whenever any dead-trigger signal fires. `'Undead'` only when all four signals are known and benign. `'Unknown'` only when no trigger fires and at least one nullable signal is `null`.
- The `now` parameter makes time injection work in tests (no `Date.now()` calls without injection).
- `pnpm test` passes.

**References:** REQ-6, design `classify-repo.ts`.

---

## Task 6 – `sort-tombstones` (core)

**Goal:** Deterministic sort function + property tests.

**Files to create:**
- `packages/core/src/sort-tombstones.ts`
- `packages/core/tests/sort-tombstones.test.ts`

**Acceptance criteria:**
- Dead repos appear before Undead repos appear before Unknown/UnknownSpecies.
- Among Dead repos, oldest `pushedAt` first.
- Among Undead repos, newest `pushedAt` first.
- Among Unknown/UnknownSpecies, alphabetical by `name`.
- Input array is not mutated.
- Property test: output length equals input length; every input item appears in output; order invariants hold for any permutation of inputs generated by fast-check.
- `pnpm test` passes.

**References:** REQ-7.3, design `sort-tombstones.ts`.

---

## Task 7 – GitHub API client

**Goal:** Server-side GitHub REST client with caching and rate-limit error handling.

**Files to create:**
- `apps/web/lib/github.ts`
- `apps/web/lib/errors.ts` — define `RateLimitError`, `NotFoundError`, `GitHubApiError`

**Acceptance criteria:**
- All tests mock `fetch` using Vitest's `vi.stubGlobal('fetch', ...)` or an equivalent; no live network calls are made.
- `fetchUserRepos('someuser')` returns at most 20 repos, all with `fork === false`; mocked response includes a mix of fork and non-fork repos to verify filtering.
- `fetchUserRepos` returns both the capped repo array and the total non-fork count seen, so the caller can derive the remainder.
- `fetchRepo('owner', 'repo')` returns a single repo object.
- `fetchFileContent('owner', 'repo', 'package.json')` returns decoded string or `null` on 404.
- All `fetch` calls use `{ next: { revalidate: 3600 } }`.
- `GITHUB_TOKEN` env var, when set, is attached as `Authorization: Bearer`.
- Mocked 403 and 429 responses throw `RateLimitError` with `resetAt` populated from `X-RateLimit-Reset`.
- Mocked 404 throws `NotFoundError`.
- Other mocked non-2xx throws `GitHubApiError`.
- TypeScript strict, no `any`.

**References:** REQ-2, REQ-8, design `github.ts`.

---

## Task 8 – npm registry client

**Goal:** Server-side npm client that counts deprecated dependencies.

**Files to create:**
- `apps/web/lib/npm.ts`

**Acceptance criteria:**
- All tests mock `fetch` using Vitest's `vi.stubGlobal('fetch', ...)` or equivalent; no live network calls are made.
- `fetchDeprecatedCount({})` → `0` (empty deps).
- For a deduplicated dependency map with 3 packages, 1 of which has a mocked `deprecated` field, returns `1`.
- Each mocked request includes `Accept: application/vnd.npm.install-v1+json` in its headers.
- No more than 8 `fetch` calls are in-flight simultaneously; verified by tracking concurrent call count in the mock.
- Uses `Promise.allSettled` so a single mocked package fetch failure does not fail the whole call.
- Returns `null` only when the input is null/undefined.
- All fetches use `{ next: { revalidate: 3600 } }`.
- TypeScript strict, no `any`.

**References:** REQ-4, design `npm.ts`.

---

## Task 9 – endoflife.date client

**Goal:** Server-side EOL client.

**Files to create:**
- `apps/web/lib/eol.ts`

**Acceptance criteria:**
- All tests mock `fetch` using Vitest's `vi.stubGlobal('fetch', ...)` or equivalent; no live network calls are made.
- A mocked response for major version `14` with a past `eol` date returns `true`.
- A mocked response for major version `22` with a future `eol` date returns `false`.
- A mocked 404 response for an unknown version returns `null`.
- Uses `{ next: { revalidate: 3600 } }`.
- EOL comparison uses UTC date, not local time.
- TypeScript strict, no `any`.

**References:** REQ-5.3, REQ-5.4, design `eol.ts`.

---

## Task 10 – Graveyard page (server component + data orchestration)

**Goal:** Wire up the data layer into a Next.js server component.

**Files to create/modify:**
- `apps/web/app/graveyard/page.tsx` — server component
- `apps/web/app/graveyard/loading.tsx` — skeleton state

**Acceptance criteria:**
- Navigating to `/graveyard?q=torvalds` triggers a GitHub user repo fetch; forks are excluded and at most 20 repos are analysed.
- When the user repo list exceeds 20 non-fork repos, a "+N more graves not dug" note is rendered below the grid.
- Navigating to `/graveyard?q=https://github.com/owner/repo` triggers a single repo fetch.
- Package names from all repos' `dependencies` and `devDependencies` are merged and deduplicated before `fetchDeprecatedCount` is called.
- For each repo, Node detection, `package.json`/`.nvmrc` fetching, and EOL lookup run in parallel via `Promise.allSettled`.
- `classifyRepo` receives `archived` from the GitHub API response alongside the other signals.
- `classifyRepo` and `sortTombstones` are called with the assembled signals.
- `RateLimitError` is caught and passed as a prop to `RateLimitError` component; page does not throw.
- `NotFoundError` renders "No soul found at that address."
- `loading.tsx` renders at least 3 skeleton tombstone-shaped `<div>` elements with a pulse animation.
- TypeScript strict, no `any`.

**References:** REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, design data-flow diagram.

---

## Task 11 – UI components

**Goal:** Implement all visual components for the tombstone grid.

**Files to create:**
- `apps/web/components/GraveyardInput.tsx`
- `apps/web/components/GraveyardGrid.tsx`
- `apps/web/components/TombstoneCard.tsx`
- `apps/web/components/StatusBadge.tsx`
- `apps/web/components/RateLimitError.tsx`

**Acceptance criteria:**

*GraveyardInput:*
- Submitting an empty string shows "Please enter a GitHub username or repo URL."
- Submitting `"not a valid@@name"` shows an inline validation error without navigating.
- Submitting a valid username navigates to `/graveyard?q=<username>`.
- Submitting `https://github.com/owner/repo.git` strips `.git` and navigates correctly.
- Button label: "Summon the Dead".

*TombstoneCard:*
- Dead repos have `shadow-red-900`; Undead have `shadow-green-900`.
- Date uses `<time datetime="...">` with the ISO date string.
- Card's root element is `<article aria-label="{name} – {status}">`.

*StatusBadge:*
- Renders emoji with a sibling `<span class="sr-only">` containing the status text.

*RateLimitError:*
- Shows the reset time and a "Try again" button.

*All components:*
- Tailwind classes only (no inline styles).
- TypeScript strict.

**References:** REQ-1, REQ-7, design UI section.

---

## Task 12 – Landing page and global styles

**Goal:** Root page, dark theme, and Tailwind configuration.

**Files to create/modify:**
- `apps/web/app/page.tsx` — renders `GraveyardInput`, title, tagline
- `apps/web/app/layout.tsx` — sets `<html className="dark">`, font imports, metadata
- `apps/web/app/globals.css` — Tailwind base + dark background on `body`
- `apps/web/tailwind.config.ts` — extend with stone-950 background, serif font family

**Acceptance criteria:**
- `body` background is stone-950 (`#0c0a09`).
- Page title is "Repo Necromancer — Graveyard".
- `GraveyardInput` is centred on the page.
- No layout shift when navigating to `/graveyard`.

**References:** design theme tokens.

---

## Task 13 – End-to-end smoke test with fixture data

**Goal:** Verify the full Graveyard flow against the fixture repos without hitting live APIs.

**Files to create/modify:**
- `fixtures/graves/` — add at least two minimal fake repo JSON fixtures: one Dead Node repo (old date, deprecated dep), one Undead Node repo, one non-Node repo.
- `packages/core/tests/graveyard-integration.test.ts` — uses the fixture data to run `classifyRepo` + `sortTombstones` and asserts the final sorted order.

**Acceptance criteria:**
- The integration test runs offline (no network calls; fixture JSON is loaded from disk).
- Dead repo sorts before Undead repo.
- Non-Node repo sorts last.
- `pnpm test` passes across the monorepo (`pnpm -r test`).

**References:** product steering ("Demo repos are fixed and replayable from cache"), REQ-6, REQ-7.3.
