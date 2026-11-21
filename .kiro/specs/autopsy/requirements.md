# Autopsy – Requirements

## Overview

Clicking a "Dead" tombstone card on the Graveyard page opens `/autopsy?repo=owner/name`. The server performs a deep static analysis of the Node.js repository and produces a structured `AutopsyReport` (defined in `packages/core` for reuse by the Soul Restore and Resurrect features), together with a short LLM-written narrative. The result is rendered in the existing dark graveyard theme.

---

## Requirements

### REQ-A1 Navigation

**REQ-A1.1** `TombstoneCard` components whose `status` is `'Dead'` render their repo name as a link to `/autopsy?repo={owner}/{name}` (HTML-encoded). Cards with other statuses are not linked.

**REQ-A1.2** The autopsy page reads the `repo` query parameter, splits on `/` to obtain `owner` and `name`, and rejects malformed values (not matching `^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$`) with an error state rather than making any network request.

---

### REQ-A2 AutopsyReport type

**REQ-A2.1** `packages/core/src/types.ts` is extended with:

```ts
export type FindingSeverity = 'fatal' | 'serious' | 'minor';
export type FindingCategory =
  | 'runtime'
  | 'deprecated-deps'
  | 'outdated-majors'
  | 'vulnerabilities'
  | 'hygiene';

export interface AutopsyFinding {
  id: string;               // stable kebab-case identifier, e.g. "node-eol"
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  evidence: string;         // factual one-liner, no LLM content
  fixHint: string;          // actionable suggestion
}

export interface AutopsyReport {
  owner: string;
  name: string;
  generatedAt: string;      // ISO 8601 UTC
  findings: AutopsyFinding[];
  causeOfDeath: AutopsyFinding | null;   // null only when findings is empty
  narrative: string;        // 3-5 sentences from the LLM (or deterministic fallback)
}
```

**REQ-A2.2** `AutopsyReport` is exported from `packages/core` so apps/worker and future features import from there, never from `apps/web`.

---

### REQ-A3 Findings collection

Each finding is produced by a pure function in `packages/core` and corresponds to one of the five categories below. All network I/O happens in the Next.js server component or in `apps/web/lib/` clients; pure functions only receive pre-fetched data.

**REQ-A3.1 Runtime finding**
Reuse `extractNodeVersion` and `resolveLtsAlias` from the graveyard feature. Query `endoflife.date` via the existing `eol.ts` client. When the resolved major version is EOL, produce a finding with:
- `id: "node-eol"`, `category: "runtime"`, `severity: "fatal"`
- `evidence`: `"Node.js {major} reached end-of-life on {date}"` (date from the API response)
- When the version is unknown, produce a minor hygiene finding `"node-version-unknown"` instead.

**REQ-A3.2 Deprecated dependencies finding**
For each package in `dependencies` and `devDependencies` (combined, up to 60; see REQ-A6.1), fetch npm registry metadata via the existing `npm.ts` client. When a package's latest version carries a non-empty `deprecated` field, include an entry. The finding is:
- `id: "deprecated-deps"`, `category: "deprecated-deps"`
- `severity: "fatal"` if ≥ 1 dep is deprecated; evidence lists each deprecated package name and its deprecation message, comma-separated (truncated at 200 chars if necessary).

**REQ-A3.3 Outdated major versions finding**
For each dependency (up to 60), compare the declared semver range's minimum version (use the smallest version satisfying the range, i.e. the declared lower bound) against the package's `latest` tag on the npm registry. When `semver.major(latest) > semver.major(minVersion)`, flag it. The finding is:
- `id: "outdated-majors"`, `category: "outdated-majors"`
- `severity: "serious"` if any dep is behind by ≥ 1 major; `evidence` lists up to 10 package names with `declared → latest` pairs.

**REQ-A3.4 Known vulnerabilities finding**
Send a single `POST https://api.osv.dev/v1/querybatch` request with one query per dependency using the `minVersion` resolved for REQ-A3.3. The request body is:
```json
{ "queries": [{ "package": { "name": "{pkg}", "ecosystem": "npm" }, "version": "{minVersion}" }] }
```
Count vulnerabilities by OSV severity (`CRITICAL`, `HIGH`, `MODERATE`, `LOW`). The finding is:
- `id: "known-vulns"`, `category: "vulnerabilities"`
- `severity: "fatal"` if any CRITICAL or HIGH; `"serious"` if any MODERATE; `"minor"` if LOW only
- `evidence`: e.g. `"3 CRITICAL, 2 HIGH, 1 MODERATE across N packages"`
- Omit this finding entirely when the OSV response has zero total vulnerabilities.

**REQ-A3.5 Hygiene findings**
Inspect the following signals via `github.ts` file-existence checks (a 404 means absent). Each absent/bad signal produces an independent finding with `category: "hygiene"` and `severity: "minor"` unless noted:
- `missing-lockfile`: no `package-lock.json` and no `yarn.lock` and no `pnpm-lock.yaml` at repo root — `severity: "serious"`
- `missing-test-script`: `package.json` has no `scripts.test` or its value is `"echo \"Error: no test specified\" && exit 1"` — `severity: "minor"`
- `dead-ci`: `.travis.yml` exists in repo root but no `.github/workflows/` directory — `severity: "minor"`
- `archived-repo`: `archived: true` on the GitHub repo object — `severity: "fatal"`

---

### REQ-A4 Cause of death

**REQ-A4.1** A pure function `pickCauseOfDeath(findings: AutopsyFinding[]): AutopsyFinding | null` selects the single most severe finding using deterministic priority rules:

1. Category priority (higher = more lethal): `archived-repo` > `node-eol` > `known-vulns` (CRITICAL/HIGH) > `deprecated-deps` > `known-vulns` (MODERATE) > `outdated-majors` > hygiene findings.
2. Among equal category priority, prefer `severity: "fatal"` > `"serious"` > `"minor"`.
3. If still tied, pick the finding whose `id` comes first alphabetically.

Returns `null` only when `findings` is empty.

---

### REQ-A5 LLM narrative

**REQ-A5.1** `packages/core/llm` exports a `generateNarrative(report: AutopsyReport): Promise<string>` function and a `createLlmProvider(config: LlmConfig): LlmProvider` factory. The active provider is chosen by the `LLM_PROVIDER` environment variable:

- `"anthropic"`: Claude Messages API using `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` (default `"claude-3-5-haiku-20241022"`). The stable system prompt is sent with `cache_control: { type: "ephemeral" }`. Every call logs `cache_creation_input_tokens` and `cache_read_input_tokens` to stdout.
- `"local"`: OpenAI-compatible chat completions at `LOCAL_LLM_BASE_URL` with `LOCAL_LLM_MODEL`.
- `"none"` (default when unset): returns a deterministic template string built from the structured findings — no network call.

**REQ-A5.2** The system prompt instructs the model to act as a spooky but factual coroner and to produce exactly 3–5 sentences. It must base its report solely on the `findings` and `causeOfDeath` passed in; it must not invent package names, dates, or version numbers.

**REQ-A5.3** If the LLM call fails (network error, non-200 response, or timeout), `generateNarrative` falls back to the deterministic template from REQ-A5.1 (`"none"` provider). The `AutopsyReport` renders fully even when LLM generation fails.

**REQ-A5.4** `LLM_PROVIDER`, `ANTHROPIC_API_KEY`, `LOCAL_LLM_BASE_URL`, and `LOCAL_LLM_MODEL` are read from `process.env`; they are never hardcoded, never logged in full, and never included in any value forwarded to the LLM.

---

### REQ-A6 Scope limits

**REQ-A6.1** At most 60 dependencies (combined `dependencies` + `devDependencies`) are analysed per repo. When the total exceeds 60, the first 60 (sorted alphabetically by name) are analysed and the `AutopsyReport` includes a `truncatedDepCount` field (number of deps not analysed) so the UI can show a note.

**REQ-A6.2** The OSV batch query in REQ-A3.4 is sent only for the same capped set of 60 packages.

---

### REQ-A7 Caching

**REQ-A7.1** All external API calls made during an autopsy (GitHub, npm registry, endoflife.date, OSV) use `{ next: { revalidate: 3600 } }` on `fetch`, consistent with the graveyard feature. The OSV `POST` request is cached by wrapping its body-keyed URL in an internal GET route or by using `unstable_cache` with a 3600-second TTL.

---

### REQ-A8 UI

**REQ-A8.1** The autopsy page (`apps/web/app/autopsy/page.tsx`) uses the dark graveyard theme (same Tailwind tokens as the graveyard: `bg-stone-950`, `bg-stone-800`, `text-stone-100`, etc.).

**REQ-A8.2** The page header shows the repo name (linked to `https://github.com/{owner}/{name}`), the `causeOfDeath.title` labelled "Cause of death", and the LLM narrative in a styled block.

**REQ-A8.3** Findings are grouped into three severity sections — Fatal, Serious, Minor — each with a count badge. Within each section, findings are listed with their `title`, `evidence`, and `fixHint`.

**REQ-A8.4** A "Download report (JSON)" button triggers a client-side download of the `AutopsyReport` as a `.json` file (using a Blob URL).

**REQ-A8.5** A "Resurrect" button is shown but disabled with the label "Resurrect (coming soon)".

**REQ-A8.6** When `truncatedDepCount > 0`, the page shows a note such as "Analysis limited to 60 of {60 + truncatedDepCount} dependencies."

**REQ-A8.7** The page must remain usable (error state shown, no unhandled crash) when any single external API call fails.

---

### REQ-A9 Non-functional

**REQ-A9.1** All pure functions added to `packages/core` (finding builders, `pickCauseOfDeath`, `minVersion` extractor, dep-cap logic) are covered by fast-check property tests with all network calls mocked.

**REQ-A9.2** The `"none"` LLM provider is used in all tests; no test makes a real LLM call.

**REQ-A9.3** TypeScript strict mode; no `any` in `packages/core`.

**REQ-A9.4** The autopsy page is accessible: each finding group has a semantic heading, severity badges include screen-reader text, and the download button has a descriptive `aria-label`.
