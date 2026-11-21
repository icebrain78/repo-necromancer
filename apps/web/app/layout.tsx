/**
 * Root layout – wraps every page in the app.
 *
 * Sets the HTML lang, applies the dark background and serif/mono font stack
 * via global CSS, and provides the metadata used by search engines and the
 * browser tab.
 */

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Repo Necromancer',
  description:
    'Resurrect abandoned GitHub repositories: diagnose why they died, bring the build back to green, and restore their soul as Kiro context.',
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-950 text-stone-100 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
