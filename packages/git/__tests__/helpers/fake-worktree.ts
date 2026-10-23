/**
 * In-memory `WorktreeManager` plus a contract harness around it.
 *
 * Why: engine tests need worktrees without spawning git. The fake keeps files in a Map per
 *   worktree and mimics the port's observable rules (idempotent create, conflict errors,
 *   ignored `*.log` files, null commit when clean) so the engine is tested against the same
 *   behaviour the contract pins for real git.
 *
 * Exports: createFakeWorktreeHarness().
 * Depends on: @forge/core (InvalidInputError, WorktreeManager), contract/{worktree,merge-in}.contract,
 *   helpers/fake-merge.
 */

import { InvalidInputError } from '@forge/core';
import type {
  Worktree,
  WorktreeDiffFile,
  WorktreeManager,
  WorktreePrep,
} from '@forge/core';
import type { MergeInHarness } from '#tests/contract/merge-in.contract.js';
import { threeWayMerge } from '#tests/helpers/fake-merge.js';

interface FakeTree {
  readonly path: string;
  readonly branch: string;
  readonly baseSha: string;
  /** Index in the base log of the newest base commit this branch holds. */
  mergedBase: number;
  head: string;
  files: Map<string, string>;
  committed: Map<string, string>;
  prep: WorktreePrep | null;
}

const BASE = new Map([
  ['README.md', 'hello\n'],
  ['.gitignore', '*.log\n'],
]);

const sha = (n: number): string => n.toString(16).padStart(40, '0');
const ignored = (name: string): boolean => name.endsWith('.log');
/** A file a recorded setup output covers: the path itself or anything under it. */
const hidden = (t: FakeTree, name: string): boolean =>
  (t.prep?.outputs ?? []).some((o) => name === o || name.startsWith(`${o}/`));

/** A commit on the fake `main`: the whole tree after it, and the file it touched. */
interface BaseCommit {
  readonly sha: string;
  readonly file: string;
  readonly state: ReadonlyMap<string, string>;
}

const unsafe = (value: string): boolean => value.startsWith('-');

export function createFakeWorktreeHarness(): MergeInHarness {
  const repoRoot = '/fake/repo';
  const worktreeRoot = '/fake/data/worktrees/repo';
  const trees = new Map<string, FakeTree>();
  const branches = new Set<string>(['main']);
  let counter = 1;
  const baseLog: BaseCommit[] = [{ sha: sha(1000), file: '', state: BASE }];
  const main = (): BaseCommit => baseLog[baseLog.length - 1] as BaseCommit;

  const tree = (path: string): FakeTree => {
    const t = trees.get(path);
    if (!t) {
      throw new InvalidInputError(`no such worktree: ${path}`);
    }

    return t;
  };

  const manager: WorktreeManager = {
    async create(ticketId, branch, baseRef): Promise<Worktree> {
      if (baseRef.startsWith('-') || branch.startsWith('-') || branch.includes('..')) {
        throw new InvalidInputError('unsafe ref');
      }

      const path = `${worktreeRoot}/${ticketId}`;
      const existing = trees.get(path);
      if (existing) {
        if (existing.branch !== branch) {
          throw new InvalidInputError('path on another branch');
        }

        return { path, baseSha: existing.baseSha };
      }

      if ([...trees.values()].some((t) => t.branch === branch)) {
        throw new InvalidInputError('branch checked out elsewhere');
      }

      const baseSha = main().sha;
      branches.add(branch);
      trees.set(path, {
        path,
        branch,
        baseSha,
        mergedBase: baseLog.length - 1,
        head: baseSha,
        files: new Map(main().state),
        committed: new Map(main().state),
        prep: null,
      });

      return { path, baseSha };
    },
    async remove(path, opts) {
      if (opts?.deleteBranch?.startsWith('-')) {
        throw new InvalidInputError('unsafe ref');
      }

      trees.delete(path);
      if (opts?.deleteBranch !== undefined) {
        branches.delete(opts.deleteBranch);
      }
    },
    async changedFiles(path) {
      const t = tree(path);
      const out: string[] = [];
      for (const [name, content] of t.files) {
        if (!ignored(name) && !hidden(t, name) && BASE.get(name) !== content) {
          out.push(name);
        }
      }

      return out.sort();
    },
    async diff(path) {
      const t = tree(path);
      const files: WorktreeDiffFile[] = [];
      const patch: string[] = [];
      const added: [string, string][] = [];
      const gone: string[] = [];
      for (const [name, content] of t.files) {
        if (ignored(name) || hidden(t, name)) {
          continue;
        }

        const was = BASE.get(name);
        if (was === undefined) {
          added.push([name, content]);
        } else if (was !== content) {
          files.push({ status: 'M', path: name });
          patch.push(`--- a/${name}\n+++ b/${name}\n+${content}`);
        }
      }

      for (const name of BASE.keys()) {
        if (!t.files.has(name)) {
          gone.push(name);
        }
      }

      for (const [name, content] of added) {
        const from = gone.findIndex((g) => BASE.get(g) === content);
        if (from >= 0) {
          const [oldPath] = gone.splice(from, 1) as [string];
          files.push({ status: 'R', path: name, oldPath });
        } else {
          files.push({ status: 'A', path: name });
          patch.push(`+++ b/${name}\n+${content}`);
        }
      }

      for (const name of gone) {
        files.push({ status: 'D', path: name });
      }

      files.sort((a, b) => (a.path < b.path ? -1 : 1));

      return { files, patch: patch.join('\n') };
    },
    async commitAll(path) {
      const t = tree(path);
      const visible = new Map([...t.files].filter(([n]) => !ignored(n) && !hidden(t, n)));
      const same =
        visible.size === t.committed.size &&
        [...visible].every(([n, c]) => t.committed.get(n) === c);

      if (same) {
        return null;
      }

      t.committed = visible;
      t.head = sha(counter++);

      return t.head;
    },
    async head(path) {
      return tree(path).head;
    },
    rootOf: (path) => path,
    async untracked(path) {
      const t = tree(path);
      const tops = [...t.files.keys()]
        .filter((n) => !ignored(n) && !BASE.has(n))
        .map((n) => n.split('/')[0] as string);

      return [...new Set(tops)].sort();
    },
    async readPrep(path) {
      return trees.get(path)?.prep ?? null;
    },
    async writePrep(path, prep) {
      tree(path).prep = prep;
    },
    async mergeIn(path, target) {
      if (unsafe(target)) {
        throw new InvalidInputError('unsafe sha');
      }

      const t = tree(path);
      const at = baseLog.findIndex((c) => c.sha === target);
      if (at < 0) {
        throw new InvalidInputError(`unknown commit ${target}`);
      }

      if (at <= t.mergedBase) {
        return { kind: 'up_to_date' };
      }

      const base = (baseLog[t.mergedBase] as BaseCommit).state;
      const theirs = (baseLog[at] as BaseCommit).state;
      const merged = threeWayMerge(base, t.files, theirs, target);
      const files = new Set(merged.conflicts.map((c) => c.path));
      const upstream = baseLog
        .slice(t.mergedBase + 1, at + 1)
        .filter((c) => files.has(c.file))
        .map((c) => ({ sha: c.sha, subject: `upstream: ${c.file}` }));

      t.files = merged.files;
      t.committed = new Map(merged.files);
      t.mergedBase = at;
      t.head = sha(counter++);

      return merged.conflicts.length === 0
        ? { kind: 'merged', head: t.head }
        : { kind: 'conflict', head: t.head, files: merged.conflicts, upstream };
    },
    async contains(path, target) {
      if (unsafe(target)) {
        throw new InvalidInputError('unsafe sha');
      }

      const t = tree(path);
      const at = baseLog.findIndex((c) => c.sha === target);

      return target === t.head || (at >= 0 && at <= t.mergedBase);
    },
  };

  return {
    manager,
    repoRoot,
    worktreeRoot,
    exists: async (p) => trees.has(p),
    branchExists: async (b) => branches.has(b),
    write: async (p, rel, content) => {
      tree(p).files.set(rel, content);
    },
    writeReadOnly: async (p, rel, content) => {
      tree(p).files.set(rel, content);
    },
    remove: async (p, rel) => {
      tree(p).files.delete(rel);
    },
    rename: async (p, from, to) => {
      const t = tree(p);
      t.files.set(to, t.files.get(from) ?? '');
      t.files.delete(from);
    },
    authorOf: async () => 'Forge',
    close: async () => undefined,
    async baseCommit(file, content) {
      const state = new Map(main().state);
      if (content === null) {
        state.delete(file);
      } else {
        state.set(file, content);
      }

      baseLog.push({ sha: sha(1000 + baseLog.length), file, state });

      return main().sha;
    },
    read: async (p, rel) => tree(p).files.get(rel) ?? null,
  };
}
