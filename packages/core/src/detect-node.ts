/**
 * Detects whether a repository is a Node.js project.
 *
 * A repo qualifies as a Node.js repo when:
 *   - the GitHub API language field is "JavaScript" or "TypeScript", OR
 *   - the repo root contains a package.json (hasPackageJson is true)
 *
 * Pure function; the caller is responsible for making any API calls.
 *
 * @param language - GitHub API `language` field value, or null
 * @param hasPackageJson - whether the repo root contains a package.json
 */
export function isNodeRepo(language: string | null, hasPackageJson: boolean): boolean {
  if (language === 'JavaScript' || language === 'TypeScript') {
    return true;
  }
  return hasPackageJson;
}
