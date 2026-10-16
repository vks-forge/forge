/**
 * Reads a git remote URL and says whether it names a GitHub repository.
 *
 * Why: when a folder already has a remote, onboarding must decide whether the project
 *   goes through a GitHub App connection (pull requests) or merges locally (d-0124). That
 *   hinges on one question, "is this remote a GitHub repository, and which one?", asked of
 *   the many spellings users have in `.git/config`: https, scp-style ssh, `ssh://`, with or
 *   without `.git` and credentials. Anything else (GitLab, a file path, a bare server) is
 *   not GitHub and the project merges locally.
 *
 * Exports: githubRepoOf().
 * Depends on: none. No IO.
 */

const HTTPS =
  /^https?:\/\/(?:[^@/]+@)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;

const SCP = /^(?:[^@/\s]+@)?github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;
const SSH =
  /^ssh:\/\/(?:[^@/]+@)?github\.com(?::\d+)?\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;

/** `{ owner, repo }` when `url` points at a GitHub repository, else null. */
export function githubRepoOf(url: string): { owner: string; repo: string } | null {
  const trimmed = url.trim();
  for (const pattern of [HTTPS, SCP, SSH]) {
    const m = pattern.exec(trimmed);
    if (m?.[1] && m[2]) {
      return { owner: m[1], repo: m[2] };
    }
  }

  return null;
}
