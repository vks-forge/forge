/**
 * In-memory `WorktreeManager` plus a contract harness around it.
 *
 * Why: engine tests need worktrees without spawning git. The fake keeps files in a Map per
 *   worktree and mimics the port's observable rules (idempotent create, conflict errors,
 *   ignored `*.log` files, null commit when clean) so the engine is tested against the same
 *   behaviour the contract pins for real git.
 *
 * Exports: createFakeWorktreeHarness().
 * Depends on: @forge/core (InvalidInputError, WorktreeManager), contract/worktree.contract.
 */

import { InvalidInputError } from '@forge/core';
import type { Worktree, WorktreeManager } from '@forge/core';
import type { WorktreeHarness } from '#tests/contract/worktree.contract.js';

interface FakeTree {
  readonly path: string;
  readonly branch: string;
  readonly baseSha: string;
  head: string;
  files: Map<string, string>;
  committed: Map<string, string>;
}

const BASE = new Map([
  ['README.md', 'hello\n'],
  ['.gitignore', '*.log\n'],
]);
const sha = (n: number): string => n.toString(16).padStart(40, '0');
const ignored = (name: string): boolean => name.endsWith('.log');

export function createFakeWorktreeHarness(): WorktreeHarness {
  const repoRoot = '/fake/repo';
  const trees = new Map<string, FakeTree>();
  const branches = new Set<string>(['main']);
  let counter = 1;

  const tree = (path: string): FakeTree => {
    const t = trees.get(path);
    if (!t) throw new InvalidInputError(`no such worktree: ${path}`);
    return t;
  };

  const manager: WorktreeManager = {
    async create(ticketId, branch, baseRef): Promise<Worktree> {
      if (baseRef.startsWith('-') || branch.startsWith('-') || branch.includes('..')) {
        throw new InvalidInputError('unsafe ref');
      }
      const path = `${repoRoot}/.worktrees/${ticketId}`;
      const existing = trees.get(path);
      if (existing) {
        if (existing.branch !== branch)
          throw new InvalidInputError('path on another branch');
        return { path, baseSha: existing.baseSha };
      }
      if ([...trees.values()].some((t) => t.branch === branch)) {
        throw new InvalidInputError('branch checked out elsewhere');
      }
      const baseSha = sha(counter++);
      branches.add(branch);
      trees.set(path, {
        path,
        branch,
        baseSha,
        head: baseSha,
        files: new Map(BASE),
        committed: new Map(BASE),
      });
      return { path, baseSha };
    },
    async remove(path) {
      trees.delete(path);
    },
    async changedFiles(path) {
      const t = tree(path);
      const out: string[] = [];
      for (const [name, content] of t.files) {
        if (!ignored(name) && BASE.get(name) !== content) out.push(name);
      }
      return out.sort();
    },
    async commitAll(path) {
      const t = tree(path);
      const visible = new Map([...t.files].filter(([n]) => !ignored(n)));
      const same =
        visible.size === t.committed.size &&
        [...visible].every(([n, c]) => t.committed.get(n) === c);
      if (same) return null;
      t.committed = visible;
      t.head = sha(counter++);
      return t.head;
    },
    async head(path) {
      return tree(path).head;
    },
  };

  return {
    manager,
    repoRoot,
    exists: async (p) => trees.has(p),
    branchExists: async (b) => branches.has(b),
    write: async (p, rel, content) => {
      tree(p).files.set(rel, content);
    },
    authorOf: async () => 'Forge',
    close: async () => undefined,
  };
}
