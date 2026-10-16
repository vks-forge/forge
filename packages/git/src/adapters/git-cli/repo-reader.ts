/**
 * RepoReader over the git CLI: read the committed tree at HEAD, never the working tree.
 *
 * Why: the Director plans a ticket by looking at the code, and what it sees must be what a
 *   Worker's worktree starts from: committed files only. Reading the object database (ls-tree,
 *   cat-file, grep on HEAD) makes untracked files, ignored secrets and uncommitted edits
 *   invisible by construction, and a project scoped to a subfolder of a bigger repository
 *   (d-0124) sees only that folder because every call runs with the folder as cwd. Paths,
 *   patterns and shas from the model are validated first (domain/repo-paths) and passed to git
 *   as separate arguments with literal pathspecs, so none can become an option or a glob.
 *
 * Decisions: binary files (NUL in the first 8000 bytes), symlinks and submodule entries are
 *   refused with PolicyDeniedError, and left out of listTracked: a binary is useless to a model
 *   and a link could point outside the project. Content comes through git's text decoding, so a
 *   file that is not valid UTF-8 shows U+FFFD for the bad bytes (its `bytes` size stays exact).
 *
 * Exports: createGitRepoReader().
 * Depends on: adapters/git-cli/run-git, domain/repo-paths, types/repo-reader, @forge/core. IO: spawns git.
 */

import { CrashError, PolicyDeniedError, globMatch } from '@forge/core';
import type { RepoFile, RepoGrepHit, RepoReader } from '@forge/core';
import { createGitRunner } from '#/adapters/git-cli/run-git.js';
import {
  assertGrepPattern,
  assertSha,
  cutUtf8,
  isUnderAny,
  normaliseRepoPath,
} from '#/domain/repo-paths.js';
import type { GitRepoReaderOptions, TreeEntry } from '#/types/repo-reader.types.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const BINARY_SNIFF_BYTES = 8000;
const BLOB_MODES = new Set(['100644', '100755']);
// Literal pathspecs: `*`, `:(top)` and friends in a name are characters, not git magic.
const ENV = { GIT_TERMINAL_PROMPT: '0', GIT_LITERAL_PATHSPECS: '1' } as const;

function parseTree(out: string): TreeEntry[] {
  const entries: TreeEntry[] = [];
  for (const record of out.split('\0')) {
    const match = /^(\d+) \w+ ([0-9a-f]+)\t(.*)$/s.exec(record);
    if (match) {
      entries.push({ mode: match[1] ?? '', sha: match[2] ?? '', name: match[3] ?? '' });
    }
  }

  return entries;
}

function parseGrep(out: string): RepoGrepHit[] {
  const hits: RepoGrepHit[] = [];
  for (const record of out.split('\n')) {
    // `HEAD:<path> NUL <line> NUL <text>`; -z keeps paths with ':' or odd characters unambiguous.
    const a = record.indexOf('\0');
    const b = record.indexOf('\0', a + 1);
    if (a < 0 || b < 0 || !record.startsWith('HEAD:')) {
      continue;
    }

    hits.push({
      path: record.slice('HEAD:'.length, a).replace(/^\.\//, ''),
      line: Number(record.slice(a + 1, b)),
      text: record.slice(b + 1).replace(/\r$/, ''),
    });
  }

  return hits;
}

/** Creates a RepoReader that shells out to `git` (default binary on PATH). */
export function createGitRepoReader(opts: GitRepoReaderOptions = {}): RepoReader {
  const runner = createGitRunner(opts.gitBinary ?? 'git');
  const runOpts = { env: ENV, timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS };
  const run = (root: string, args: readonly string[]) => runner.run(root, args, runOpts);

  return {
    async headSha(root) {
      const sha = (await run(root, ['rev-parse', '--verify', 'HEAD'])).trim();
      assertSha(sha);

      return sha;
    },

    async listTracked(root, glob) {
      const out = await run(root, ['ls-tree', '-r', '-z', 'HEAD', '--', '.']);
      const names = parseTree(out)
        .filter((entry) => BLOB_MODES.has(entry.mode))
        .map((entry) => entry.name);

      return glob === undefined ? names : names.filter((name) => globMatch(glob, name));
    },

    async readAtHead(root, path, maxBytes): Promise<RepoFile> {
      const name = normaliseRepoPath(path);
      const [entry, ...extra] = parseTree(
        await run(root, ['ls-tree', '-z', 'HEAD', '--', name]),
      );

      if (!entry || extra.length > 0 || entry.name !== name) {
        throw new PolicyDeniedError(`not a tracked file at HEAD: ${name}`);
      }

      if (!BLOB_MODES.has(entry.mode)) {
        throw new PolicyDeniedError(
          `not a regular file (directory, symlink or submodule): ${name}`,
        );
      }

      const bytes = Number((await run(root, ['cat-file', '-s', entry.sha])).trim());
      if (!Number.isSafeInteger(bytes)) {
        throw new CrashError(`git reported no size for ${name}`);
      }

      const buffer = Buffer.from(
        await run(root, ['cat-file', 'blob', entry.sha]),
        'utf8',
      );

      if (buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)) {
        throw new PolicyDeniedError(`binary file: ${name}`);
      }

      return {
        path: name,
        content: cutUtf8(buffer, maxBytes),
        bytes,
        truncated: bytes > maxBytes,
      };
    },

    async grepAtHead(root, pattern, glob, maxHits) {
      assertGrepPattern(pattern);
      const r = await runner.try(
        root,
        ['grep', '-n', '-I', '-E', '--no-color', '-z', '-e', pattern, 'HEAD', '--', '.'],
        runOpts,
      );

      // Exit 1 is "no match"; anything else non-zero (bad regex, not a repository) is a failure.
      if (r.code === 1) {
        return [];
      }

      if (r.code !== 0) {
        throw new CrashError(
          `git grep failed (exit ${r.code}): ${r.stderr.trim().slice(-1000)}`,
        );
      }

      const hits = parseGrep(r.stdout);
      const kept =
        glob === undefined ? hits : hits.filter((hit) => globMatch(glob, hit.path));

      return kept.slice(0, Math.max(0, maxHits));
    },

    async changedFiles(root, fromSha, toSha, paths) {
      assertSha(fromSha);
      assertSha(toSha);
      const out = await run(root, [
        'diff',
        '--name-only',
        '--relative',
        '--no-renames',
        '--no-ext-diff',
        '-z',
        fromSha,
        toSha,
        '--',
        '.',
      ]);

      return out
        .split('\0')
        .filter((file) => file !== '' && isUnderAny(file, paths))
        .sort();
    },
  };
}
