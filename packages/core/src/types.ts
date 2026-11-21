/**
 * Shared types for Repo Necromancer.
 * These are consumed by both packages/core logic and apps/web UI.
 */

/** Classification verdict for a repository. */
export type RepoStatus = 'Dead' | 'Undead' | 'Unknown' | 'UnknownSpecies';

/**
 * Raw signals collected about a repository before classification.
 * Nullable fields indicate that the signal could not be determined.
 */
export interface RepoSignals {
  /** ISO 8601 timestamp of the most recent push (from GitHub `pushed_at`). */
  pushedAt: string;
  /** Whether the repo is archived on GitHub. */
  archived: boolean;
  /** Whether the repo is a Node.js project. */
  isNodeRepo: boolean;
  /** Number of deprecated packages found in dependencies + devDependencies. null = unknown. */
  deprecatedDepCount: number | null;
  /** Whether the detected Node.js runtime version is past its end-of-life date. null = unknown. */
  nodeVersionEol: boolean | null;
}

/**
 * All data needed to render a tombstone card.
 */
export interface TombstoneData {
  owner: string;
  name: string;
  url: string;
  language: string | null;
  /** ISO 8601 timestamp of the most recent push (from GitHub `pushed_at`). */
  pushedAt: string;
  archived: boolean;
  /** Number of deprecated deps, or null when the package.json could not be fetched/parsed. */
  deprecatedDepCount: number | null;
  /** Resolved Node.js major version string, e.g. "18". null = not detected. */
  nodeVersion: string | null;
  /** Whether the detected Node.js runtime is EOL. null = unknown. */
  nodeVersionEol: boolean | null;
  status: RepoStatus;
}
