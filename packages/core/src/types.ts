/**
 * Shared types for Repo Necromancer.
 * These are consumed by both packages/core logic and apps/web UI.
 */

// ---------------------------------------------------------------------------
// Autopsy types
// ---------------------------------------------------------------------------

/** How serious an autopsy finding is. */
export type FindingSeverity = 'fatal' | 'serious' | 'minor';

/** Which dimension of health a finding addresses. */
export type FindingCategory =
  | 'runtime'
  | 'deprecated-deps'
  | 'outdated-majors'
  | 'vulnerabilities'
  | 'hygiene';

/**
 * A single diagnostic finding produced during autopsy analysis.
 * All fields are factual; `narrative` prose lives on `AutopsyReport`.
 */
export interface AutopsyFinding {
  /** Stable kebab-case identifier, e.g. "node-eol". */
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  /** Factual one-liner — no LLM content. */
  evidence: string;
  /** Actionable suggestion. */
  fixHint: string;
}

/**
 * Full static-analysis result for one repository autopsy.
 * Produced by `assembleReport` in packages/core and consumed by both
 * the web UI and the worker's Soul Restore / Resurrect stages.
 */
export interface AutopsyReport {
  owner: string;
  name: string;
  /** ISO 8601 UTC timestamp of when the report was assembled. */
  generatedAt: string;
  findings: AutopsyFinding[];
  /** The single most critical finding; null only when findings is empty. */
  causeOfDeath: AutopsyFinding | null;
  /** 3–5 sentence narrative from the LLM (or deterministic fallback). */
  narrative: string;
  /**
   * Number of dependencies that were not analysed because the total exceeded
   * the 60-dep cap. 0 means all dependencies were analysed.
   */
  truncatedDepCount: number;
}

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
