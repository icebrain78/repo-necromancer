# Graveyard – Requirements

## Overview

The Graveyard is the entry point of Repo Necromancer. A user supplies a GitHub username or a single repo URL; the app fetches that user's public repos (or the one repo), analyses each for signs of death, and renders a grid of tombstone cards. Each tombstone tells the repo's story: when it was last touched, what runtime it ran on, whether its dependencies have rotted, and a final verdict.

---

## Requirements

### REQ-1 Input

**REQ-1.1** The user can enter either a GitHub username (e.g. `torvalds`) or a full GitHub repo URL (e.g. `https://github.com/acme/widget`).

**REQ-1.2** Input is validated before any network request is made. A username must match `^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$`. A repo URL must match `https://github.com/<owner>/<repo>` (trailing `.git` stripped). Anything else shows an inline validation error without a page navigation.

**REQ-1.3** An empty submission is rejected with a prompt to enter a value.

---

### REQ-2 GitHub data fetching

**REQ-2.1** For a username, the app calls `GET /users/{username}/repos?per_page=100&sort=pushed` on the GitHub REST API v3, collects only non-fork repos (`fork: false`), and stops once 20 qualifying repos have been gathered or all pages are exhausted. Any repos beyond that limit are not analysed; the UI shows a note such as "+N more graves not dug" where N is the count of remaining non-fork repos returned by the API (up to what was fetched) minus 20.

**REQ-2.2** For a single repo URL the app calls `GET /repos/{owner}/{repo}`.

**REQ-2.3** Requests include `Authorization: Bearer <GITHUB_TOKEN>` when the env var `GITHUB_TOKEN` is set, and omit the header otherwise. `GITHUB_TOKEN` is **required in production deployment** to avoid unauthenticated rate limits (60 req/h); the deployment README must document this.

**REQ-2.4** A 403 or 429 response (rate limit) surfaces a user-visible spooky message ("The spirits are restless — GitHub's rate limit has been reached. Try again after {reset time} or add a GITHUB_TOKEN.") and no tombstones are rendered until the user retries.

**REQ-2.5** Non-404 HTTP errors show a generic error state; 404 shows "No soul found at that address."

---

### REQ-3 Node.js detection

**REQ-3.1** A repo is considered a Node.js repo when any of the following is true: the GitHub API `language` field is `"JavaScript"` or `"TypeScript"`, or the repo root contains a `package.json` file (checked via `GET /repos/{owner}/{repo}/contents/package.json`).

**REQ-3.2** Repos that are not Node.js repos are shown as an "Unknown species" tombstone — name and language visible, no dependency or runtime analysis, no Dead/Undead verdict.

**REQ-3.3** The Node.js detection check for `package.json` is only made when the `language` field alone is inconclusive (i.e. not JavaScript or TypeScript). This avoids a redundant API call for the common case.

---

### REQ-4 Dependency rot analysis

**REQ-4.1** For each Node.js repo, the app fetches `package.json` from the default branch via `GET /repos/{owner}/{repo}/contents/package.json` and decodes the Base64 body.

**REQ-4.2** All package names in `dependencies` and `devDependencies` are collected across all analysed repos and **deduplicated** before any registry requests are made. Each unique name is looked up at `https://registry.npmjs.org/{name}` using the abbreviated metadata `Accept: application/vnd.npm.install-v1+json` header to minimise response size, and the `deprecated` field on the latest version object is inspected. Registry requests are made with a **concurrency limit of 8** simultaneous in-flight requests.

**REQ-4.3** A package is counted as deprecated if `deprecated` is a non-empty string. The tombstone shows the count of deprecated packages (e.g. "3 deprecated deps").

**REQ-4.4** If `package.json` cannot be fetched or parsed, the deprecated count is treated as unknown (`null`) and the tombstone shows "deps unknown".

---

### REQ-5 Runtime EOL analysis

**REQ-5.1** The app extracts the Node.js version from the repo using the following priority:
1. `engines.node` field in `package.json` (semver range, e.g. `">=16.0.0 <18"`)
2. `.nvmrc` file contents (fetched via `/contents/.nvmrc`)
3. If neither exists, the Node version is unknown.

**REQ-5.2** From the extracted value the app resolves a major version integer (e.g. `16` from `">=16"`, `lts/gallium` resolves to `16`). Named LTS aliases (`lts/hydrogen`, `lts/iron`, etc.) are mapped to their major version via a static lookup table maintained in `packages/core`.

**REQ-5.3** The resolved major version is checked against the `endoflife.date` API: `GET https://endoflife.date/api/nodejs/{major}.json`. A version is EOL when the `eol` date in the response is in the past relative to the current UTC date.

**REQ-5.4** If the version cannot be resolved or the endoflife.date API returns a non-200 response, the EOL status is treated as unknown and the tombstone shows "runtime unknown".

---

### REQ-6 Status classification

**REQ-6.1** A Node.js repo is classified as **Dead** when any **known** signal is a dead trigger:
- The last push date is more than two years before the current date (using the `pushed_at` field from the GitHub API).
- The resolved Node.js runtime is EOL (`nodeVersionEol === true`).
- The count of deprecated dependencies is ≥ 1.
- The repo is archived (`archived === true` from the GitHub API).

A single firing trigger is sufficient; the others need not be known.

**REQ-6.2** A Node.js repo is classified as **Undead** only when **all four signals are known and benign**: pushed within two years, non-EOL runtime, zero deprecated deps, and not archived.

**REQ-6.3** A Node.js repo that has no firing trigger but has at least one unknown signal (EOL status or deprecated count is `null`, and staleness/archived are benign) is classified as **Unknown**.

---

### REQ-7 Tombstone card display

**REQ-7.1** Each tombstone card shows:
- Repo name (linked to `https://github.com/<owner>/<repo>`)
- Primary language (or "Unknown" if null)
- Last commit label: "Died: YYYY-MM-DD" for Dead repos; "Last seen: YYYY-MM-DD" for Undead; date formatted from `pushed_at`
- Deprecated dep count or "deps unknown"
- EOL runtime version and label, or "runtime unknown"
- Status badge: "💀 Dead", "🧟 Undead", or "❓ Unknown species"

**REQ-7.2** "Unknown species" tombstones show only name, language, and the "Unknown species" badge — no date label, no dep/runtime fields.

**REQ-7.3** The tombstone grid is sorted: Dead repos first (sorted by `pushed_at` ascending, oldest first), then Undead (sorted by `pushed_at` descending), then Unknown species.

---

### REQ-8 Caching

**REQ-8.1** All external API responses (GitHub, npm registry, endoflife.date) are cached for 60 minutes, keyed by the full request URL.

**REQ-8.2** Caching is implemented by passing `{ next: { revalidate: 3600 } }` as the second argument to `fetch` in each API client (`apps/web/lib/github.ts`, `npm.ts`, `eol.ts`). This uses Next.js's built-in Data Cache; no Route Handler, no `unstable_cache`, and no external cache store are required.

**REQ-8.3** A cached response must be used if it is less than 60 minutes old; otherwise the cache entry is refreshed.

---

### REQ-9 Non-functional

**REQ-9.1** The core analysis functions in `packages/core` are pure (no I/O, no side effects) and covered by property-based tests using fast-check.

**REQ-9.2** All TypeScript is compiled in strict mode; no `any` types in `packages/core`.

**REQ-9.3** The UI is accessible: tombstone cards use semantic HTML, status badges include accessible text (not emoji-only), and colour contrast meets WCAG AA.

**REQ-9.4** The page must remain usable (input visible, error state shown) when the GitHub API is unreachable.
