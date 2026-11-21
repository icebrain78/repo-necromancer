/**
 * Extracts the leading Node.js major version from common version specifiers.
 *
 * Sources checked in priority order:
 *   1. `engines.node` from package.json (semver range, e.g. `">=16.0.0 <18"`)
 *   2. `.nvmrc` file contents (e.g. `"v18"`, `"18.3.0"`, `"lts/hydrogen"`)
 *
 * LTS alias resolution (e.g. `lts/hydrogen` → `18`) is **not** done here;
 * callers should follow up with `resolveLtsAlias` from `resolve-lts-alias.ts`.
 *
 * Returns the major version as a decimal string (e.g. `"16"`, `"18"`) or
 * `null` when no parseable version can be extracted.
 *
 * Pure function — no I/O, no side effects.
 */

/** Strips common range/prefix operators and returns the leading major version digit string. */
function parseMajor(raw: string): string | null {
  const trimmed = raw.trim();

  // Reject empty strings early.
  if (trimmed.length === 0) {
    return null;
  }

  // Pass through lts/... aliases as-is so callers can resolve them.
  // A string starting with "lts/" (case-insensitive) is not a numeric version.
  if (/^lts\//i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // Strip recognised range operators and 'v' prefix, then extract the leading integer.
  // Handles: v18, 18, >=16, ^14, ~12, <=10, >8, 18.3.0, >=16.0.0 <18, etc.
  const stripped = trimmed.replace(/^[v^~>=<!]+/, '').trim();

  const match = /^(\d+)/.exec(stripped);
  if (match === null) {
    return null;
  }

  return match[1] ?? null;
}

/**
 * Extracts the leading Node.js major version from `engines.node` or `.nvmrc`.
 *
 * @param packageJsonEngines - The `engines.node` field value from package.json,
 *   e.g. `">=16.0.0 <18"`. Pass `undefined` when absent.
 * @param nvmrc - The raw text content of `.nvmrc`, e.g. `"v18\n"`.
 *   Pass `undefined` when the file is absent.
 * @returns The major version as a string (e.g. `"18"`) or `null` when neither
 *   source yields a parseable major version.
 */
export function extractNodeVersion(
  packageJsonEngines: string | undefined,
  nvmrc: string | undefined,
): string | null {
  // Priority 1: engines.node
  if (packageJsonEngines !== undefined) {
    const major = parseMajor(packageJsonEngines);
    if (major !== null) {
      return major;
    }
  }

  // Priority 2: .nvmrc
  if (nvmrc !== undefined) {
    // .nvmrc may contain a single line with optional trailing newline/whitespace.
    // Use only the first non-empty line.
    const firstLine = nvmrc.split('\n').find((line) => line.trim().length > 0) ?? '';
    const major = parseMajor(firstLine);
    if (major !== null) {
      return major;
    }
  }

  return null;
}
