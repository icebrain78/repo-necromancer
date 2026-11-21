import type { AutopsyFinding } from '../types.js';

export interface HygieneSignals {
  /** True when any lockfile (package-lock.json, yarn.lock, pnpm-lock.yaml) is present. */
  hasLockfile: boolean;
  /** False when scripts.test is absent or is the npm placeholder. */
  hasTestScript: boolean;
  /** True when .travis.yml exists in the repo root. */
  hasTravisCi: boolean;
  /** True when .github/workflows/ directory exists. */
  hasGithubWorkflows: boolean;
  /** True when the GitHub repo is archived. */
  archived: boolean;
}

const NPM_TEST_PLACEHOLDER = 'echo "Error: no test specified" && exit 1';

/**
 * Returns zero or more hygiene findings based on repository signals.
 * Each signal maps deterministically to a fixed finding or nothing.
 */
export function buildHygieneFindings(signals: HygieneSignals): AutopsyFinding[] {
  const findings: AutopsyFinding[] = [];

  if (signals.archived) {
    findings.push({
      id: 'archived-repo',
      category: 'hygiene',
      severity: 'fatal',
      title: 'Repository is archived',
      evidence: 'The GitHub repository has been archived and is read-only.',
      fixHint: 'Fork the repository to create an active copy you can maintain.',
    });
  }

  if (!signals.hasLockfile) {
    findings.push({
      id: 'missing-lockfile',
      category: 'hygiene',
      severity: 'serious',
      title: 'No lockfile found',
      evidence:
        'Neither package-lock.json, yarn.lock, nor pnpm-lock.yaml was found at the repo root.',
      fixHint:
        'Run `npm install`, `yarn`, or `pnpm install` to generate a lockfile and commit it.',
    });
  }

  if (!signals.hasTestScript) {
    findings.push({
      id: 'missing-test-script',
      category: 'hygiene',
      severity: 'minor',
      title: 'No test script configured',
      evidence: `The package.json "scripts.test" field is absent or is the default npm placeholder ("${NPM_TEST_PLACEHOLDER}").`,
      fixHint:
        'Add a test runner (e.g. Vitest or Jest) and configure "scripts.test" in package.json.',
    });
  }

  if (signals.hasTravisCi && !signals.hasGithubWorkflows) {
    findings.push({
      id: 'dead-ci',
      category: 'hygiene',
      severity: 'minor',
      title: 'CI configuration is obsolete',
      evidence:
        'A .travis.yml file is present but no GitHub Actions workflows were found. Travis CI free tier ended in 2020.',
      fixHint:
        'Migrate CI to GitHub Actions by adding a workflow file under .github/workflows/.',
    });
  }

  return findings;
}
