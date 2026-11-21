import type { TombstoneData } from './types.js';

/**
 * Sorts tombstone cards into three display buckets:
 *
 *   1. Dead     – ascending `pushedAt` (oldest first, most rotten at the top)
 *   2. Undead   – descending `pushedAt` (most recently active first)
 *   3. Unknown / UnknownSpecies – alphabetical by `name`
 *
 * Returns a new array; the input is never mutated.
 *
 * @param cards - tombstone data to sort
 */
export function sortTombstones(cards: TombstoneData[]): TombstoneData[] {
  const dead: TombstoneData[] = [];
  const undead: TombstoneData[] = [];
  const rest: TombstoneData[] = [];

  for (const card of cards) {
    if (card.status === 'Dead') {
      dead.push(card);
    } else if (card.status === 'Undead') {
      undead.push(card);
    } else {
      rest.push(card);
    }
  }

  dead.sort((a, b) => Date.parse(a.pushedAt) - Date.parse(b.pushedAt));
  undead.sort((a, b) => Date.parse(b.pushedAt) - Date.parse(a.pushedAt));
  rest.sort((a, b) => a.name.localeCompare(b.name));

  return [...dead, ...undead, ...rest];
}
