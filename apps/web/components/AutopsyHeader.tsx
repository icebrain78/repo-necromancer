/**
 * AutopsyHeader – server component.
 *
 * Displays the repo name (linked to GitHub), the primary cause of death,
 * and the LLM narrative blockquote.
 *
 * REQ-A8.2, REQ-A9.4
 */

import type { AutopsyReport } from '@repo-necromancer/core/types';

interface AutopsyHeaderProps {
  report: AutopsyReport;
}

export function AutopsyHeader({ report }: AutopsyHeaderProps) {
  const { owner, name, causeOfDeath, narrative } = report;

  return (
    <header className="mb-8 space-y-3">
      <h1 className="font-serif text-3xl text-stone-100">
        <a
          href={`https://github.com/${owner}/${name}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-stone-300 underline underline-offset-4"
        >
          {owner}/{name}
        </a>
      </h1>

      <p className="text-red-400 font-semibold">
        Cause of death:{' '}
        {causeOfDeath ? causeOfDeath.title : 'No cause identified'}
      </p>

      <blockquote className="border-l-4 border-stone-500 pl-4 text-stone-300 italic leading-relaxed">
        {narrative}
      </blockquote>
    </header>
  );
}
