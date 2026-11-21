/**
 * Caps a dependency map to at most `limit` entries.
 *
 * Keys are sorted alphabetically before slicing so the selection is
 * deterministic regardless of the original object's key insertion order.
 * The input object is never mutated.
 *
 * @returns `capped` — a new object with at most `limit` entries.
 * @returns `truncatedDepCount` — the number of entries that were dropped.
 *   Zero when the total count was at or below the limit.
 */
export function capDependencies(
  deps: Record<string, string>,
  limit: number,
): { capped: Record<string, string>; truncatedDepCount: number } {
  const sortedKeys = Object.keys(deps).sort();
  const capped: Record<string, string> = {};

  for (let i = 0; i < Math.min(sortedKeys.length, limit); i++) {
    const key = sortedKeys[i];
    // key is always defined because i < sortedKeys.length
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    capped[key!] = deps[key!]!;
  }

  const truncatedDepCount = Math.max(0, sortedKeys.length - limit);
  return { capped, truncatedDepCount };
}
