/**
 * GraveyardGrid – server component that lays out tombstone cards in a CSS grid.
 *
 * Uses a stone-texture background (bg-stone-900) and a 3-column responsive grid.
 * The optional `remainder` prop drives the "+N more graves not dug" note (REQ-2.1).
 */

import type { TombstoneData } from '@repo-necromancer/core/types';
import { TombstoneCard } from './TombstoneCard';

interface GraveyardGridProps {
  tombstones: TombstoneData[];
  remainder?: number;
}

export function GraveyardGrid({ tombstones, remainder = 0 }: GraveyardGridProps) {
  return (
    <div className="bg-stone-900 p-6 rounded-lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {tombstones.map((card) => (
          <TombstoneCard key={`${card.owner}/${card.name}`} card={card} />
        ))}
      </div>

      {remainder > 0 && (
        <p className="mt-6 text-center text-stone-500 text-sm">
          +{remainder} more graves not dug
        </p>
      )}
    </div>
  );
}
