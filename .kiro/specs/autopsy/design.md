# Autopsy – Design

## Architecture overview

```
apps/web
  app/
    autopsy/
      page.tsx              ← server component; orchestrates data fetch → AutopsyReport
      loading.tsx           ← skeleton (skull animation placeholder)
  components/
    AutopsyHeader.tsx       ← repo link + cause of death + narrative block
    FindingsGroup.tsx       ← one severity section with count badge
    FindingCard.tsx         ← title / evidence / fixHint card
    DownloadReportButton.tsx ← client component; Blob URL download
    ResurrectButton.tsx     ← disabled placeholder; client component

packages/core
  src/
    types.ts                ← extended with AutopsyFinding, AutopsyReport (see REQ-A2)
    autopsy/
      build-runtime-finding.ts    ← buildRuntimeFinding(nodeVersion, eolDate): AutopsyFinding[]
      build-dep-findings.ts       ← buildDepFindings(depResults): AutopsyFinding[]
      build-vuln-finding.ts       ← buildVulnFinding(osvResults): AutopsyFinding | null
      build-hygiene-findings.ts   ← buildHygieneFindings(signals): AutopsyFinding[]
      pick-cause-of-death.ts      ← pickCauseOfDeath(findings): AutopsyFinding | null
      resolve-min-version.ts      ← resolveMinVersion(range: string): string | null
      cap-dependencies.ts         ← capDependencies(deps, limit): { capped, truncatedDepCount }
      assemble-report.ts          ← assembleReport(...): AutopsyReport (pure, no I/O)
  llm/
    types.ts                ← LlmProvider interface, LlmConfig type
    none-provider.ts        ← deterministic template from findings
    anthropic-provider.ts   ← Claude Messages API with prompt caching
    local-provider.ts       ← OpenAI-compatible chat completions
    index.ts                ← createLlmProvider(config), generateNarrative(report)
  tests/
    autopsy/
      build-runtime-finding.test.ts
      build-dep-findings.test.ts
      build-vuln-finding.test.ts
      build-hygiene-findings.test.ts
      pick-cause-of-death.test.ts
      resolve-min-version.test.ts
      cap-dependencies.test.ts
      assemble-report.test.ts
    llm/
      none-provider.test.ts

apps/web/lib/
  osv.ts                    ← OSV.dev batch query client
  npm.ts                    ← extended: fetchDeprecatedAndLatest(deps)
```

---

## Data flow

```
User clicks Dead tombstone → /autopsy?repo=owner/name
        │
        ▼
autopsy/page.tsx (server component)
  1. Parse + validate ?repo param → { owner, name }
  2. Parallel fetch (Promise.allSettled):
       a. github.ts: fetchRepo(owner, name)                → archived flag, default branch
       b. github.ts: fetchFileContent(owner, name, 'package.json')   → raw JSON string
       c. github.ts: fetchFileContent(owner, name, '.nvmrc')         → string | null
       d. github.ts: fetchFileContent(owner, name, 'package-lock.json') → exists check
       e. github.ts: fetchFileContent(owner, name, 'yarn.lock')         → exists check
       f. github.ts: fetchFileContent(owner, name, 'pnpm-lock.yaml')    → exists check
       g. github.ts: fetchFileContent(owner, name, '.travis.yml')        → exists check
       h. github.ts: fetchDirListing(owner, name, '.github/workflows')   → exists check
  3. Parse package.json → { engines, dependencies, devDependencies }
  4. cap-dependencies.ts: capDependencies(allDeps, 60) → { capped, truncatedDepCount }
  5. extractNodeVersion + resolveLtsAlias → majorVersion
  6. Parallel fetch (Promise.allSettled):
       a. eol.ts: fetchEolDate(majorVersion) → { eol: string } (raw date, not just boolean)
       b. npm.ts: fetchDeprecatedAndLatest(capped) [concurrency ≤ 8]
       c. osv.ts: fetchVulnBatch(capped)
  7. Pure assembly (packages/core, no I/O):
       buildRuntimeFinding(majorVersion, eolDate)
       buildDepFindings(npmResults)
       buildVulnFinding(osvResults)
       buildHygieneFindings({ hasLockfile, hasTestScript, hasTravis, hasWorkflows, archived })
       pickCauseOfDeath(allFindings)
  8. generateNarrative(partialReport) → narrative string
  9. assembleReport(...) → AutopsyReport
        │
        ▼
AutopsyHeader + FindingsGroup[] + DownloadReportButton + ResurrectButton
```

---

## Key type additions (`packages/core/src/types.ts`)

```ts
export type FindingSeverity = 'fatal' | 'serious' | 'minor';

export type FindingCategory =
  | 'runtime'
  | 'deprecated-deps'
  | 'outdated-majors'
  | 'vulnerabilities'
  | 'hygiene';

export interface AutopsyFinding {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  evidence: string;
  fixHint: string;
}

export interface AutopsyReport {
  owner: string;
  name: string;
  generatedAt: string;             // ISO 8601 UTC
  findings: AutopsyFinding[];
  causeOfDeath: AutopsyFinding | null;
  narrative: string;
  truncatedDepCount: number;       // 0 when all deps were analysed
}
```

---

## `packages/core/autopsy` module designs

### `resolve-min-version.ts`

```ts
resolveMinVersion(range: string): string | null
```

Finds the lowest version that satisfies the given semver range string. Implementation: strip leading `^`, `~`, `>=`, `>` and return the first version-like token (`\d+\.\d+\.\d+` or `\d+\.\d+` or `\d+`), normalised to `major.minor.patch` with missing parts filled as `0`. Returns `null` for `*`, `latest`, or unparseable inputs.

Property tests: fast-check generates semver-looking strings; output is either a dotted-numeric string or `null`.

---

### `cap-dependencies.ts`

```ts
capDependencies(
  deps: Record<string, string>,
  limit: number
): { capped: Record<string, string>; truncatedDepCount: number }
```

Sorts keys alphabetically, takes the first `limit`, returns the rest count as `truncatedDepCount`. Pure; no mutation of input.

Property tests: `Object.keys(capped).length <= limit` always holds; `truncatedDepCount === max(0, totalKeys - limit)`.

---

### `build-runtime-finding.ts`

```ts
buildRuntimeFinding(
  majorVersion: number | null,
  eolDate: string | null   // ISO date from endoflife.date, or null on failure
): AutopsyFinding[]
```

Returns `[]` when `majorVersion` is null and `eolDate` is null (nothing to report). When `majorVersion` is null but we tried and failed: returns `[{ id: "node-version-unknown", category: "runtime", severity: "minor", ... }]`. When EOL date is known and in the past: returns `[{ id: "node-eol", severity: "fatal", ... }]`. When EOL date is in the future: returns `[]` (not a finding; healthy runtime is not flagged as a finding).

---

### `build-dep-findings.ts`

```ts
interface DepResult {
  name: string;
  declared: string;         // declared range from package.json
  deprecated: string | null; // deprecation message or null
  latest: string | null;    // latest version tag from npm
  minVersion: string | null; // resolved by resolve-min-version
}

buildDepFindings(results: DepResult[]): AutopsyFinding[]
```

Produces 0, 1, or 2 findings: one `deprecated-deps` finding (if any deprecated) and one `outdated-majors` finding (if any major lag). Both are built from the same `results` array in a single pass.

Deprecated finding: severity `"fatal"` when count ≥ 1; evidence lists name + message pairs up to 200 chars.

Outdated-majors finding: severity `"serious"` when count ≥ 1; evidence lists up to 10 `name: vX → vY` pairs.

---

### `build-vuln-finding.ts`

```ts
interface OsvVulnSummary {
  critical: number;
  high: number;
  moderate: number;
  low: number;
  affectedPackages: number;
}

buildVulnFinding(summary: OsvVulnSummary): AutopsyFinding | null
```

Returns `null` when all counts are 0. Severity: `"fatal"` if `critical + high > 0`, `"serious"` if `moderate > 0`, `"minor"` otherwise (only low). Evidence string: `"N CRITICAL, N HIGH, N MODERATE, N LOW across P packages"` (omit zero-count severities).

---

### `build-hygiene-findings.ts`

```ts
interface HygieneSignals {
  hasLockfile: boolean;
  hasTestScript: boolean;      // false when absent or is the npm placeholder string
  hasTravisCi: boolean;
  hasGithubWorkflows: boolean;
  archived: boolean;
}

buildHygieneFindings(signals: HygieneSignals): AutopsyFinding[]
```

Deterministic: each `false`/`true` maps to a fixed finding or nothing. `archived` → `"archived-repo"` (fatal). No lockfile → `"missing-lockfile"` (serious). No test script → `"missing-test-script"` (minor). Travis present + no workflows → `"dead-ci"` (minor).

---

### `pick-cause-of-death.ts`

```ts
pickCauseOfDeath(findings: AutopsyFinding[]): AutopsyFinding | null
```

Category priority order (index 0 = highest):

```
["archived-repo", "node-eol", "known-vulns-critical", "deprecated-deps",
 "known-vulns-moderate", "outdated-majors", "missing-lockfile",
 "dead-ci", "missing-test-script", "node-version-unknown"]
```

Because `known-vulns` appears at two priority levels depending on the finding's severity (fatal/serious), the comparator checks `id === "known-vulns"` and uses the severity to pick the right priority slot.

Tie-breaking: severity rank `fatal > serious > minor`, then alphabetical `id`.

Pure function; never mutates input.

Property tests: for any non-empty finding array, the result is always one of the input findings; for an empty array, the result is `null`; the result is always the globally dominant finding (checked by exhaustive enumeration of a small fast-check model).

---

### `assemble-report.ts`

```ts
assembleReport(
  owner: string,
  name: string,
  findings: AutopsyFinding[],
  causeOfDeath: AutopsyFinding | null,
  narrative: string,
  truncatedDepCount: number,
  now?: Date
): AutopsyReport
```

Pure. Sets `generatedAt` to `now.toISOString()` (defaults to `new Date()`). No I/O.

---

## LLM module (`packages/core/llm/`)

### Interface

```ts
// llm/types.ts
export interface LlmProvider {
  generateNarrative(report: AutopsyReport): Promise<string>;
}

export interface LlmConfig {
  provider: 'anthropic' | 'local' | 'none';
  anthropicApiKey?: string;
  anthropicModel?: string;
  localBaseUrl?: string;
  localModel?: string;
}
```

### `none-provider.ts`

Builds a deterministic string from `report.findings` and `report.causeOfDeath`. Template:

> "This repository has {N} finding(s): {causeOfDeath.title} is the primary cause of death. Additional issues include {other titles}. The evidence shows {causeOfDeath.evidence}. Recommended action: {causeOfDeath.fixHint}."

Adjusted to 3–5 sentences; no I/O; always synchronous inside a resolved Promise.

### `anthropic-provider.ts`

- Sends a `POST https://api.anthropic.com/v1/messages` request.
- System prompt (stable, sent with `cache_control: { type: "ephemeral" }`):

  > "You are a spooky but factual coroner examining dead GitHub repositories. Write a 3–5 sentence report using only the structured findings provided. Never invent package names, version numbers, or dates. Use atmospheric but professional language."

- User message: JSON.stringify of `{ causeOfDeath, findings }` (no secrets, no raw repo content).
- Logs `usage.cache_creation_input_tokens` and `usage.cache_read_input_tokens` to stdout on every call.
- On non-200: throws; caller catches and falls back to `none-provider`.

### `local-provider.ts`

- `POST {LOCAL_LLM_BASE_URL}/v1/chat/completions` with model `LOCAL_LLM_MODEL`.
- Same system + user message structure as `anthropic-provider`.
- On error: throws; caller falls back to `none-provider`.

### `index.ts`

```ts
export function createLlmProvider(config: LlmConfig): LlmProvider
export async function generateNarrative(report: AutopsyReport): Promise<string>
```

`createLlmProvider` reads `config.provider` and instantiates the appropriate class. `generateNarrative` calls `createLlmProvider` using env vars, calls `provider.generateNarrative(report)`, and catches any error by falling back to `noneProvider.generateNarrative(report)`.

---

## API client additions (`apps/web/lib/`)

### `npm.ts` extension: `fetchDeprecatedAndLatest`

```ts
fetchDeprecatedAndLatest(
  deps: Record<string, string>
): Promise<DepResult[]>
```

Extends the existing `fetchDeprecatedCount` pattern. For each package, the abbreviated registry response (`dist-tags.latest`, `versions[latest].deprecated`) provides both fields. Concurrency ≤ 8 via the same semaphore. Returns `DepResult[]`; failed individual fetches produce `{ deprecated: null, latest: null, minVersion: null }` for that package.

### `osv.ts` (new)

```ts
fetchVulnBatch(deps: Record<string, string>): Promise<OsvVulnSummary>
```

- `POST https://api.osv.dev/v1/querybatch` with the request body described in REQ-A3.4.
- Iterates `responses[].vulns[]` (may be absent when empty); counts by `severity[].type` (`CRITICAL`, `HIGH`, `MODERATE`, `LOW`). Counts `affectedPackages` as the number of queries that returned ≥ 1 vuln.
- Cached via `unstable_cache` from `next/cache` with key `["osv", ...sortedPackageKeys]` and `revalidate: 3600`, since `fetch` cache does not apply to POST bodies.
- Returns zeroed `OsvVulnSummary` on HTTP error.

### `github.ts` extension: `fetchDirListing`

```ts
fetchDirListing(owner: string, repo: string, path: string): Promise<boolean>
```

`GET /repos/{owner}/{repo}/contents/{path}` — returns `true` when the response is 200 and an array (directory exists with entries), `false` on 404 or when the response is not an array.

---

## UI components (`apps/web`)

### `AutopsyHeader`

Server component. `<header>` with:
- `<h1>` containing the repo name as an external link.
- `<p className="text-red-400 font-semibold">` with "Cause of death: {causeOfDeath.title}" (or "No cause identified" when null).
- `<blockquote>` for the narrative with a subtle left border in `border-stone-500`.

### `FindingsGroup`

Server component. Accepts `severity: FindingSeverity` and `findings: AutopsyFinding[]`. Renders an `<section>` with a `<h2>` ("Fatal" / "Serious" / "Minor") and a count badge (`<span className="sr-only">N findings</span>`). Skips rendering entirely when `findings` is empty. Fatal section uses `text-red-400`; Serious uses `text-orange-400`; Minor uses `text-yellow-400`.

### `FindingCard`

Server component. Renders a `<article>` with `bg-stone-800 border border-stone-700 rounded p-4`. Shows `title` (bold), `evidence` (monospace, `text-stone-300`), and `fixHint` prefixed with "Fix: " in `text-stone-400`.

### `DownloadReportButton`

Client component (`"use client"`). Receives the serialised report as a prop string. On click: creates a `Blob` with `type: "application/json"`, creates an object URL, triggers an `<a>` click with `download="{owner}-{name}-autopsy.json"`, then revokes the URL. `aria-label="Download autopsy report as JSON"`.

### `ResurrectButton`

Client component. `<button disabled className="opacity-40 cursor-not-allowed ...">Resurrect (coming soon)</button>`. No interactivity.

---

## Error handling summary

| Scenario | Behaviour |
|---|---|
| Malformed `?repo` param | Error state: "Invalid repository address." |
| GitHub 404 | "No soul found at that address." |
| GitHub 403/429 | Reuse `RateLimitError` component from graveyard |
| `package.json` absent or unparseable | findings for missing-lockfile, missing-test-script still run; dep/vuln findings skipped |
| npm registry partial failure | Failed packages get `deprecated: null, latest: null`; finding built from successful results only |
| OSV API failure | `fetchVulnBatch` returns zeroed summary; no vuln finding produced |
| endoflife.date failure | `buildRuntimeFinding` receives `eolDate: null`; no EOL finding, no crash |
| LLM failure | `generateNarrative` falls back to none-provider; report renders fully |

---

## Caching strategy

Consistent with graveyard: all `fetch` calls use `{ next: { revalidate: 3600 } }`. The OSV POST is wrapped in `unstable_cache`. No external cache store required.

---

## Dark theme tokens (same as graveyard)

| Token | Usage |
|---|---|
| `bg-stone-950` | Page background |
| `bg-stone-800` | Finding cards |
| `border-stone-700` | Card border |
| `text-stone-100` | Primary text |
| `text-stone-300` | Evidence text (monospace) |
| `text-stone-400` | Secondary / fix hint text |
| `text-red-400` | Fatal severity, cause of death |
| `text-orange-400` | Serious severity |
| `text-yellow-400` | Minor severity |
| `border-stone-500` | Narrative blockquote left border |
