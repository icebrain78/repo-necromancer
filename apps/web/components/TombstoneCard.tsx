/**
 * TombstoneCard – server component rendering a single tombstone.
 *
 * Dead repos get a red glow, Undead get a green glow (design.md).
 * Unknown-species tombstones only show name, language, and badge (REQ-7.2).
 * The card uses semantic <article> with aria-label (REQ-9.3).
 */

import type { TombstoneData } from '@repo-necromancer/core/types';
import { StatusBadge } from './StatusBadge';

interface TombstoneCardProps {
  card: TombstoneData;
}

/** Format an ISO timestamp to YYYY-MM-DD. */
function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function glowStyle(card: TombstoneData): React.CSSProperties {
  if (card.status === 'Dead') {
    return { boxShadow: '0 0 10px rgba(127,29,29,0.5)' };
  }
  if (card.status === 'Undead') {
    return { boxShadow: '0 0 10px rgba(20,83,45,0.5)' };
  }
  return {};
}

export function TombstoneCard({ card }: TombstoneCardProps) {
  return (
    <article
      aria-label={`${card.name} – ${card.status}`}
      className="bg-stone-800 border border-stone-600 rounded-lg p-5 flex flex-col gap-2"
      style={glowStyle(card)}
    >
      <h2 className="font-serif text-stone-100 text-lg font-semibold">
        <a
          href={card.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-stone-300 underline underline-offset-2"
        >
          {card.name}
        </a>
      </h2>

      <p className="text-stone-400 text-sm">
        {card.language ?? 'Unknown language'}
      </p>

      {card.status !== 'UnknownSpecies' && (
        <>
          <p className="text-stone-400 text-sm font-mono">
            {card.status === 'Dead' ? 'Died: ' : 'Last seen: '}
            <time dateTime={card.pushedAt}>{formatDate(card.pushedAt)}</time>
          </p>

          <p className="text-stone-400 text-sm">
            {card.deprecatedDepCount === null
              ? 'deps unknown'
              : `${card.deprecatedDepCount} deprecated dep${card.deprecatedDepCount === 1 ? '' : 's'}`}
          </p>

          <p className="text-stone-400 text-sm font-mono">
            {card.nodeVersion === null
              ? 'runtime unknown'
              : card.nodeVersionEol === true
                ? `Node ${card.nodeVersion} (EOL)`
                : `Node ${card.nodeVersion}`}
          </p>
        </>
      )}

      <div className="mt-auto pt-2">
        <StatusBadge status={card.status} />
      </div>
    </article>
  );
}
