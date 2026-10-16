/**
 * Fake RepoReader over an in-memory file map.
 *
 * Why: the planning steps read the project's tracked files at HEAD, and the approval floor
 *   asks git which files moved since a plan was verified. The engine scenarios need both to be
 *   present, observable (which reads happened, in what order) and easy to bend (a file that
 *   changed, a HEAD that moved, a tracked file that is missing), without a git process. The fake
 *   refuses what the real reader refuses (untracked and `..` paths), so a scenario cannot pass
 *   on a read the product would never allow.
 *
 * Exports: FakeRepoReader, createFakeRepoReader().
 * Depends on: @forge/core (RepoReader, PolicyDeniedError, globMatch). No IO.
 */

import { PolicyDeniedError, globMatch } from '@forge/core';
import type { RepoFile, RepoGrepHit, RepoReader } from '@forge/core';

export interface FakeRepoReader extends RepoReader {
  /** Tracked files at HEAD, path to content. Edit freely between ticks. */
  files: Record<string, string>;
  /** What `headSha` returns. */
  head: string;
  /** Files `changedFiles` reports as changed (filtered by the paths asked about). */
  changed: string[];
  /** Every call, in order, as `op path-or-pattern`. */
  readonly calls: string[];
}

export function createFakeRepoReader(files: Record<string, string> = {}): FakeRepoReader {
  const fake: FakeRepoReader = {
    files: { ...files },
    head: 'sha-head-1',
    changed: [],
    calls: [],
    async headSha() {
      fake.calls.push('head');

      return fake.head;
    },
    async listTracked(_root, glob) {
      fake.calls.push(`list ${glob ?? '*'}`);

      return Object.keys(fake.files).filter(
        (p) => glob === undefined || globMatch(glob, p),
      );
    },
    async readAtHead(_root, path, maxBytes): Promise<RepoFile> {
      fake.calls.push(`read ${path}`);
      const content = fake.files[path];
      if (content === undefined || path.split('/').includes('..')) {
        throw new PolicyDeniedError(`${path} is not a tracked file`);
      }

      const bytes = Buffer.byteLength(content);

      return {
        path,
        content: content.slice(0, maxBytes),
        bytes,
        truncated: bytes > maxBytes,
      };
    },
    async grepAtHead(_root, pattern, glob, maxHits) {
      fake.calls.push(`grep ${pattern}`);
      const re = new RegExp(pattern);
      const hits: RepoGrepHit[] = [];
      for (const [path, content] of Object.entries(fake.files)) {
        if (glob !== undefined && !globMatch(glob, path)) {
          continue;
        }

        content.split('\n').forEach((text, i) => {
          if (re.test(text) && hits.length < maxHits) {
            hits.push({ path, line: i + 1, text });
          }
        });
      }

      return hits;
    },
    async changedFiles(_root, _from, _to, paths) {
      fake.calls.push('changed');

      return fake.changed.filter((c) =>
        paths.some((p) => c === p || c.startsWith(`${p}/`)),
      );
    },
  };

  return fake;
}
