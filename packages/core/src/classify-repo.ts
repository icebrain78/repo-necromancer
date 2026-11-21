import type { RepoSignals, RepoStatus } from './types.js';

/**
 * Classifies a repository into one of four status buckets based on its signals.
 *
 * Rules (applied in order):
 *   1. `isNodeRepo === false`                        → 'UnknownSpecies'
 *   2. Any **known** dead trigger fires              → 'Dead'
 *      Dead triggers:
 *        - archived === true
 *        - last push > 2 years ago
 *        - nodeVersionEol === true
 *        - deprecatedDepCount >= 1
 *   3. All four signals known and all benign         → 'Undead'
 *   4. No trigger fires but ≥ 1 signal is null      → 'Unknown'
 *
 * The `now` parameter is injected so the function remains pure and testable.
 *
 * @param signals - signals collected for the repository
 * @param now     - current timestamp in ms (defaults to Date.now())
 */
export function classifyRepo(signals: RepoSignals, now: number = Date.now()): RepoStatus {
  const { isNodeRepo, archived, pushedAt, nodeVersionEol, deprecatedDepCount } = signals;

  // Rule 1 — not a Node repo at all
  if (!isNodeRepo) {
    return 'UnknownSpecies';
  }

  // Staleness: more than 2 years ago (using 365.25 days/year per spec)
  const TWO_YEARS_MS = 2 * 365.25 * 24 * 60 * 60 * 1000;
  const isStale = now - Date.parse(pushedAt) > TWO_YEARS_MS;

  // Rule 2 — any known dead trigger fires
  if (archived || isStale || nodeVersionEol === true || (deprecatedDepCount !== null && deprecatedDepCount >= 1)) {
    return 'Dead';
  }

  // Rule 3 — all signals known and all benign → Undead
  if (nodeVersionEol !== null && deprecatedDepCount !== null) {
    return 'Undead';
  }

  // Rule 4 — at least one signal unknown, no trigger fired
  return 'Unknown';
}
