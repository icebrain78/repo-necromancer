/**
 * Landing page – the entry point to Repo Necromancer.
 *
 * Renders the application title, a short tagline, and the GraveyardInput
 * component. On submit, GraveyardInput navigates to /graveyard?q=<value>.
 */

import { GraveyardInput } from '../components/GraveyardInput';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-8 gap-8">
      <div className="text-center space-y-3">
        <h1 className="font-serif text-5xl text-stone-100 tracking-tight">
          Repo Necromancer
        </h1>
        <p className="text-stone-400 text-lg max-w-md">
          Resurrect abandoned GitHub repositories. Enter a username or repo URL
          to unearth its fate.
        </p>
      </div>

      <GraveyardInput />

      <footer className="absolute bottom-6 text-stone-600 text-xs">
        Powered by GitHub, npm registry, and endoflife.date
      </footer>
    </main>
  );
}
