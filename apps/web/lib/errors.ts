/**
 * Custom error types for API clients in apps/web/lib.
 */

/**
 * Thrown when GitHub returns 403 or 429 (rate-limited).
 * `resetAt` is a human-readable UTC string derived from X-RateLimit-Reset header.
 */
export class RateLimitError extends Error {
  readonly resetAt: string | null;

  constructor(resetAt: string | null) {
    super(
      resetAt
        ? `GitHub rate limit reached. Resets at ${resetAt}.`
        : 'GitHub rate limit reached.',
    );
    this.name = 'RateLimitError';
    this.resetAt = resetAt;
  }
}

/**
 * Thrown when GitHub returns 404.
 */
export class NotFoundError extends Error {
  constructor(message = 'Resource not found.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * Thrown for all other non-OK GitHub API responses.
 */
export class GitHubApiError extends Error {
  readonly status: number;

  constructor(status: number, statusText: string) {
    super(`GitHub API error: ${status} ${statusText}`);
    this.name = 'GitHubApiError';
    this.status = status;
  }
}
