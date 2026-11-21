# Implementation Plan: Autopsy

## Overview

Build the Autopsy feature for Repo Necromancer: deep static analysis of a Dead Node.js repo, producing a structured `AutopsyReport` with findings, cause of death, and an LLM narrative.

## Task Dependency Graph

1->2,3,4,5; 2+3+4->6; 5->7; 6+7->8; 8->9; 9->10; 10->11; all->12

## Tasks

- [ ] 1. Extend shared types with AutopsyReport
  - Depends on: graveyard task 1
  - Add `FindingSeverity`, `FindingCategory`, `AutopsyFinding`, `AutopsyReport` to `packages/core/src/types.ts`
  - Add `truncatedDepCount: number` field to `AutopsyReport`
  - Export all new types from the `packages/core` package entry point

- [ ] 2. resolve-min-version and cap-dependencies (core)
  - Depends on: 1
  - Create `packages/core/src/autopsy/resolve-min-version.ts` with `resolveMinVersion(range): string | null`
  - Create `packages/core/src/autopsy/cap-dependencies.ts` with `capDependencies(deps, limit)` returning `{ capped, truncatedDepCount }`
  - Create `packages/core/tests/autopsy/resolve-min-version.test.ts` with unit and fast-check property tests (output is dotted-numeric string or null)
  - Create `packages/core/tests/autopsy/cap-dependencies.test.ts` with property tests verifying `Object.keys(capped).length <= limit` and correct `truncatedDepCount`

- [ ] 3. Finding builder pure functions (core)
  - Depends on: 1
  - Create `packages/core/src/autopsy/build-runtime-finding.ts` with `buildRuntimeFinding(majorVersion, eolDate): AutopsyFinding[]`
  - Create `packages/core/src/autopsy/build-dep-findings.ts` with `buildDepFindings(results: DepResult[]): AutopsyFinding[]` (produces deprecated-deps and outdated-majors findings)
  - Create `packages/core/src/autopsy/build-vuln-finding.ts` with `buildVulnFinding(summary: OsvVulnSummary): AutopsyFinding | null`
  - Create `packages/core/src/autopsy/build-hygiene-findings.ts` with `buildHygieneFindings(signals: HygieneSignals): AutopsyFinding[]`
  - Create `packages/core/tests/autopsy/build-runtime-finding.test.ts`
  - Create `packages/core/tests/autopsy/build-dep-findings.test.ts`
  - Create `packages/core/tests/autopsy/build-vuln-finding.test.ts`
  - Create `packages/core/tests/autopsy/build-hygiene-findings.test.ts`

- [ ] 4. pick-cause-of-death and assemble-report (core)
  - Depends on: 1, 3
  - Create `packages/core/src/autopsy/pick-cause-of-death.ts` with `pickCauseOfDeath(findings): AutopsyFinding | null` using the deterministic priority rules from REQ-A4.1
  - Create `packages/core/src/autopsy/assemble-report.ts` with `assembleReport(owner, name, findings, causeOfDeath, narrative, truncatedDepCount, now?): AutopsyReport`
  - Create `packages/core/tests/autopsy/pick-cause-of-death.test.ts` with property tests: result is always a member of input array; empty input returns null; dominant finding is always chosen
  - Create `packages/core/tests/autopsy/assemble-report.test.ts` with unit tests

- [ ] 5. LLM provider module (core)
  - Depends on: 1
  - Create `packages/core/llm/types.ts` with `LlmProvider` interface and `LlmConfig` type
  - Create `packages/core/llm/none-provider.ts` with deterministic 3–5 sentence template from findings
  - Create `packages/core/llm/anthropic-provider.ts` calling Claude Messages API; system prompt with `cache_control: { type: "ephemeral" }`; logs `cache_creation_input_tokens` and `cache_read_input_tokens`; throws on non-200
  - Create `packages/core/llm/local-provider.ts` calling OpenAI-compatible chat completions at `LOCAL_LLM_BASE_URL`; throws on error
  - Create `packages/core/llm/index.ts` exporting `createLlmProvider(config)` and `generateNarrative(report)` with fallback to none-provider on any error
  - Create `packages/core/tests/llm/none-provider.test.ts` verifying output is a non-empty string containing cause-of-death title; no LLM_PROVIDER env var needed

- [ ] 6. OSV client and npm client extension (web)
  - Depends on: 1, 2
  - Create `apps/web/lib/osv.ts` with `fetchVulnBatch(deps): Promise<OsvVulnSummary>` using `POST https://api.osv.dev/v1/querybatch`; cache via `unstable_cache` with key `["osv", ...sortedKeys]` and `revalidate: 3600`; return zeroed summary on error
  - Extend `apps/web/lib/npm.ts` with `fetchDeprecatedAndLatest(deps): Promise<DepResult[]>`; reuse existing concurrency limiter; failed individual fetches produce null fields
  - Extend `apps/web/lib/github.ts` with `fetchDirListing(owner, repo, path): Promise<boolean>`

- [ ] 7. Autopsy page server component (web)
  - Depends on: 1, 2, 3, 4, 5, 6
  - Create `apps/web/app/autopsy/page.tsx` server component:
    - Validate `?repo` param; show error state for malformed values
    - Fan out all GitHub file-existence checks in `Promise.allSettled`
    - Parse `package.json`; call `capDependencies(allDeps, 60)`
    - Fan out npm, OSV, and endoflife.date fetches in `Promise.allSettled`
    - Call all pure builder functions; call `pickCauseOfDeath`; call `generateNarrative`; call `assembleReport`
    - Pass `AutopsyReport` and stringified JSON to child components
  - Create `apps/web/app/autopsy/loading.tsx` skeleton placeholder

- [ ] 8. Autopsy UI components (web)
  - Depends on: 1, 7
  - Create `apps/web/components/AutopsyHeader.tsx` with repo link, cause-of-death line, and narrative blockquote
  - Create `apps/web/components/FindingsGroup.tsx` for one severity section; skip render when findings array is empty; use correct Tailwind colour per severity
  - Create `apps/web/components/FindingCard.tsx` with title, evidence (monospace), and fix hint
  - Create `apps/web/components/DownloadReportButton.tsx` ("use client"; Blob URL download; `aria-label="Download autopsy report as JSON"`)
  - Create `apps/web/components/ResurrectButton.tsx` ("use client"; disabled with "Resurrect (coming soon)" label)
  - Add `truncatedDepCount` note to autopsy page when value > 0

- [ ] 9. Link Dead tombstones to autopsy page (web)
  - Depends on: 8
  - Update `apps/web/components/TombstoneCard.tsx`: wrap repo name in `<Link href="/autopsy?repo={owner}/{name}">` when `status === 'Dead'`; leave other statuses as plain text

- [ ] 10. Autopsy integration test with fixture data
  - Depends on: 1, 2, 3, 4, 5
  - Add a fixture in `fixtures/graves/` representing a Dead Node.js repo (package.json with a deprecated dep, an EOL Node version, and no lockfile)
  - Create `packages/core/tests/autopsy/autopsy-integration.test.ts` using the fixture data; mock all network calls; use `LLM_PROVIDER=none`; assert the assembled report's `findings` contain at least `"node-eol"`, `"deprecated-deps"`, and `"missing-lockfile"`; assert `causeOfDeath` is not null

## Notes

- All `packages/core/autopsy` and `packages/core/llm` functions are pure or have all network calls mocked in tests
- `LLM_PROVIDER=none` is the default for all tests; no test makes a real LLM or API call
- TypeScript strict mode; no `any` in `packages/core`
- OSV POST is cached via `unstable_cache`; all other calls use `fetch` with `revalidate: 3600`
- At most 60 deps analysed; excess count reported in `AutopsyReport.truncatedDepCount` and shown in UI
