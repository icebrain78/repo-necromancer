/**
 * Resolves the minimum (lower-bound) version from a semver range string.
 *
 * Strategy: strip leading range operators (`^`, `~`, `>=`, `>`, `<=`, `<`, `=`)
 * from the first token and extract the first version-like segment.
 * Missing minor/patch parts are filled with `.0`.
 *
 * Returns `null` for wildcards (`*`), dist-tags (`latest`, `next`, …), or
 * strings that contain no digit-led version token.
 */
export function resolveMinVersion(range: string): string | null {
  const trimmed = range.trim();

  // Wildcard or empty → no resolvable version
  if (trimmed === '' || trimmed === '*') {
    return null;
  }

  // Dist-tags: strings with no digit at all after stripping operators
  // e.g. "latest", "next", "beta"
  // We'll detect these after stripping operators below.

  // Take only the first whitespace-separated token (handles compound ranges
  // like ">=16.0.0 <18" — lower bound is first).
  const firstToken = trimmed.split(/\s+/)[0] ?? '';

  // Strip leading range operators: >=, <=, >, <, ^, ~, =
  const stripped = firstToken.replace(/^[>=<^~]+/, '');

  // Strip leading "v" or "V"
  const noV = stripped.replace(/^[vV]/, '');

  // Must start with a digit now
  if (!/^\d/.test(noV)) {
    return null;
  }

  // Extract the leading version-like token: digits separated by dots
  const match = noV.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) {
    return null;
  }

  const major = match[1] ?? '0';
  const minor = match[2] ?? '0';
  const patch = match[3] ?? '0';

  return `${major}.${minor}.${patch}`;
}
