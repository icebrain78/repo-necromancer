# Graveyard – Design

## Architecture overview

```
apps/web
  app/
    page.tsx                  ← landing page with GraveyardInput
    graveyard/
      page.tsx                ← server component; fetches repos, renders GraveyardGrid
      loading.tsx             ← skeleton tombstones
  components/
    GraveyardInput.tsx        ← controlled input + submit; client component
    GraveyardGrid.tsx         ← grid layout; server component
    TombstoneCard.tsx         ← individual card; server component
    StatusBadge.tsx           ← 💀 / 🧟 / ❓ badge with aria-label
    RateLimitError.tsx        ← spooky rate-limit message
  lib/
    github.ts                 ← GitHub REST API client (fetch wrapper + cache)
    npm.ts                    ← npm registry client (fetch wrapper + cache)
    eol.ts                    ← endoflife.date client (fetch wrapper + cache)

packages/core
  src/
    types.ts                  ← shared TypeScript types
    detect-node.ts            ← isNodeRepo(repo): boolean
    extract-node-version.ts   ← extractNodeVersion(packageJson, nvmrc): string | null
    resolve-lts-alias.ts      ← resolveLtsAlias(alias): number | null  (static table)
    classify-repo.ts          ← classifyRepo(signals): RepoStatus
    sort-tombstones.ts        ← sortTombstones(cards): TombstoneCard[]
  tests/
    detect-node.test.ts
    extract-node-version.test.ts
    resolve-lts-alias.test.ts
    classify-repo.test.ts
    sort-tombstones.test.ts
```

---

## Data flow

```
User submits input
       │
       ▼
GraveyardInput (client) ──► navigate to /graveyard?q=<input>
       │
       ▼
/graveyard page.tsx (server component)
  1. Parse ?q → username or repo URL
  2. github.ts: fetchUserRepos(username) → up to 20 non-fork repos + remainder count
                | fetchRepo(owner, repo)
  3. Collect all deps across repos → deduplicate package names
  4. npm.ts: fetchDeprecatedCount(dedupedDeps)  [concurrency ≤ 8]
  5. For each repo in parallel (Promise.allSettled):
       a. detect-node.ts: isNodeRepo(repo)                   [core, pure]
       b. If Node: github.ts fetchFile(package.json)
       c. If Node: github.ts fetchFile(.nvmrc) [optional]
       d. Look up per-repo deprecated count from step 4 results
       e. eol.ts: fetchEolStatus(majorVersion)
  6. classify-repo.ts: classifyRepo(signals)                 [core, pure]
  7. sort-tombstones.ts: sortTombstones(cards)               [core, pure]
       │
       ▼
GraveyardGrid → TombstoneCard[]  +  "+N more graves not dug" note if remainder > 0
```

---

## Key types (`packages/core/src/types.ts`)

```ts
export type RepoStatus = 'Dead' | 'Undead' | 'Unknown' | 'UnknownSpecies';

export interface RepoSignals {
  pushedAt: string;          // ISO 8601
  archived: boolean;         // from GitHub API
  isNodeRepo: boolean;
  deprecatedDepCount: number | null;
  nodeVersionEol: boolean | null;  // null = unknown
}

export interface TombstoneData {
  owner: string;
  name: string;
  url: string;
  language: string | null;
  pushedAt: string;          // ISO 8601, from GitHub pushed_at
  archived: boolean;
  deprecatedDepCount: number | null;
  nodeVersion: string | null;     // e.g. "18"
  nodeVersionEol: boolean | null;
  status: RepoStatus;
}
```

---

## `packages/core` module designs

### `detect-node.ts`

```ts
isNodeRepo(language: string | null, hasPackageJson: boolean): boolean
```

Returns `true` when `language` is `"JavaScript"` or `"TypeScript"`, or when `hasPackageJson` is `true`. Pure function; `hasPackageJson` is passed in by the caller (the server component decides whether to make the extra API call).

Property tests: exhaustive over all combinations of language × hasPackageJson.

---

### `extract-node-version.ts`

```ts
extractNodeVersion(
  packageJsonEngines: string | undefined,  // engines.node value
  nvmrc: string | undefined                // raw .nvmrc content
): string | null
```

Parsing priority: `packageJsonEngines` first, then `nvmrc`. Strips `^`, `~`, `>=`, `<=`, `v` prefixes and range operators to extract the leading major version integer as a string. Returns `null` if neither source yields a parseable major version.

Does **not** resolve LTS aliases — that is delegated to `resolve-lts-alias.ts`.

Property tests: fast-check generates random semver-like strings and verifies the output is either a numeric string or `null`.

---

### `resolve-lts-alias.ts`

Static lookup table mapping Node.js LTS codenames to their major version. Covers `argon`→4, `boron`→6, `carbon`→8, `dubnium`→10, `erbium`→12, `fermium`→14, `gallium`→16, `hydrogen`→18, `iron`→20, `jod`→22. Input is normalised to lowercase before lookup.

```ts
resolveLtsAlias(alias: string): number | null
```

Returns `null` for unrecognised aliases. Property tests: all known aliases round-trip correctly; an arbitrary string not in the table returns `null`.

---

### `classify-repo.ts`

```ts
classifyRepo(signals: RepoSignals): RepoStatus
```

Implements the classification rules from REQ-6:

| Condition | Result |
|---|---|
| `isNodeRepo === false` | `'UnknownSpecies'` |
| `archived === true` **OR** `pushedAt` > 2 years ago **OR** `nodeVersionEol === true` **OR** `deprecatedDepCount >= 1` | `'Dead'` |
| All four signals known and benign (not archived, pushed within 2y, non-EOL, 0 deprecated deps) | `'Undead'` |
| No trigger fires but ≥ 1 signal is `null`/unknown | `'Unknown'` |

"More than two years ago" is calculated as: `Date.now() - Date.parse(pushedAt) > 2 * 365.25 * 24 * 60 * 60 * 1000`. The current date is injected as an optional parameter `now: number = Date.now()` to keep the function pure and testable.

`archived` and `pushedAt` are always known (present on every GitHub API response), so they never contribute to the `'Unknown'` path — only `nodeVersionEol` and `deprecatedDepCount` can be `null`.

Property tests with fast-check model the full signal space and assert the classification table is consistent.

---

### `sort-tombstones.ts`

```ts
sortTombstones(cards: TombstoneData[]): TombstoneData[]
```

Three-bucket sort: Dead (ascending `pushedAt`) → Undead (descending `pushedAt`) → UnknownSpecies / Unknown. Within the last bucket, alphabetical by `name`. Returns a new array; does not mutate input.

---

## API clients (`apps/web/lib/`)

All three clients follow the same pattern:

```ts
async function fetchX(params): Promise<Result> {
  const res = await fetch(url, {
    next: { revalidate: 3600 },   // Next.js built-in 1-hour cache
    headers: { ... },
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return res.json();
}
```

### `github.ts`

- `fetchUserRepos(username)` — pages `GET /users/{username}/repos?per_page=100&sort=pushed` via `Link` header. Skips repos where `fork === true`. Stops collecting once 20 non-fork repos have been gathered. Returns the array of up to 20 repos **and** the total count of non-fork repos seen (so the caller can compute the "+N more graves not dug" remainder).
- `fetchRepo(owner, repo)` — single `GET /repos/{owner}/{repo}`.
- `fetchFileContent(owner, repo, path)` — `GET /repos/{owner}/{repo}/contents/{path}`, decodes Base64, returns string. Returns `null` on 404.
- Attaches `Authorization: Bearer ${process.env.GITHUB_TOKEN}` when the env var is set.
- Throws a `RateLimitError` on 403/429, populating `resetAt` from the `X-RateLimit-Reset` header (Unix timestamp → human-readable UTC string).

### `npm.ts`

- `fetchDeprecatedCount(deps: Record<string, string>)` — accepts the merged, deduplicated dependency map assembled by the server component across all repos being analysed. Fans out registry requests using a **concurrency limiter capped at 8** simultaneous requests (implemented with a simple semaphore or `p-limit`). Each request uses `Accept: application/vnd.npm.install-v1+json` to fetch abbreviated metadata. Uses `Promise.allSettled` so a single failure does not abort the batch. Counts names where the latest version's `deprecated` field is a non-empty string. Returns `number | null` (null only when input is null/undefined).

### `eol.ts`

- `fetchEolStatus(majorVersion: number)` — `GET https://endoflife.date/api/nodejs/{majorVersion}.json`. Returns `boolean` (true = EOL) or `null` on error. EOL is `new Date(data.eol) < new Date()`.

---

## UI components (`apps/web`)

### `GraveyardInput`

Client component. Single text input + "Summon the Dead" button. On submit: validates input against the two patterns from REQ-1.2, shows inline error if invalid, otherwise pushes `/graveyard?q=<encoded-value>` via `useRouter`.

### `GraveyardGrid`

Server component. Receives `TombstoneData[]` and renders a CSS Grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`). The grid has a dark stone-texture background (Tailwind `bg-stone-900`).

### `TombstoneCard`

Server component. Renders a single tombstone using a stone-grey card (`bg-stone-800 border border-stone-600`). Dead repos get a subtle red glow (`shadow-red-900`), Undead get a green glow (`shadow-green-900`). The card's main content is an `<article>` with `aria-label="{name} – {status}"`.

Date is rendered as a `<time datetime="{ISO}">` element.

### `StatusBadge`

Renders the emoji badge with a visually-hidden `<span className="sr-only">` containing the full text ("Dead", "Undead", "Unknown species") for screen readers.

### `RateLimitError`

Shown in place of the grid when a `RateLimitError` is thrown. Displays the spooky message from REQ-2.4 with the reset time and a "Try again" button that reloads the page.

---

## Error handling summary

| Scenario | Behaviour |
|---|---|
| Invalid input | Inline validation error, no fetch |
| 404 from GitHub | "No soul found at that address." |
| 403 / 429 from GitHub | `RateLimitError` → `RateLimitError` component |
| Other GitHub HTTP error | Generic "Something stirred in the dark…" error state |
| npm registry fetch failure | `deprecatedDepCount: null` → "deps unknown" on card |
| endoflife.date failure | `nodeVersionEol: null` → "runtime unknown" on card |
| `package.json` absent or unparseable | Both dep count and node version set to `null` |

---

## Caching strategy

Next.js `fetch` with `{ next: { revalidate: 3600 } }` is used in all three API clients. This stores responses in Next.js's built-in Data Cache, keyed by URL, for 60 minutes. No external Redis or KV store is needed for the Graveyard feature. Cache entries are shared across concurrent requests for the same URL.

---

## Dark theme tokens

| Token | Value | Usage |
|---|---|---|
| `bg-stone-950` | #0c0a09 | Page background |
| `bg-stone-900` | #1c1917 | Grid background |
| `bg-stone-800` | #292524 | Tombstone card |
| `border-stone-600` | #57534e | Card border |
| `text-stone-100` | #f5f5f4 | Primary text |
| `text-stone-400` | #a8a29e | Secondary text (language, dates) |
| `text-red-500` | #ef4444 | Dead status |
| `text-green-400` | #4ade80 | Undead status |
| `text-stone-400` | #a8a29e | Unknown status |

Font: system-serif stack (`font-serif`) for tombstone names, monospace for dates and version strings.
