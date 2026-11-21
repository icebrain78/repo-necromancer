/**
 * StatusBadge – renders the status emoji with accessible hidden text.
 *
 * The emoji is marked aria-hidden; a visually-hidden <span> carries the
 * full label for screen readers (REQ-9.3).
 */

import type { RepoStatus } from '@repo-necromancer/core/types';

interface StatusBadgeProps {
  status: RepoStatus;
}

const CONFIG: Record<
  RepoStatus,
  { emoji: string; label: string; colorClass: string }
> = {
  Dead: {
    emoji: '💀',
    label: 'Dead',
    colorClass: 'text-red-500',
  },
  Undead: {
    emoji: '🧟',
    label: 'Undead',
    colorClass: 'text-green-400',
  },
  Unknown: {
    emoji: '❓',
    label: 'Unknown',
    colorClass: 'text-stone-400',
  },
  UnknownSpecies: {
    emoji: '❓',
    label: 'Unknown species',
    colorClass: 'text-stone-400',
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const { emoji, label, colorClass } = CONFIG[status];

  return (
    <span className={colorClass}>
      <span aria-hidden="true">{emoji} </span>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true">{label}</span>
    </span>
  );
}
