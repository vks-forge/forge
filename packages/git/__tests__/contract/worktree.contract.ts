/**
 * Contract every `WorktreeManager` must pass: `describeWorktreeContract(name, make)`.
 *
 * Why: the Director cuts one worktree per ticket, reads what the Worker really changed
 *   from it, commits the result and removes the tree, all through the port (d-0059). It
 *   must behave the same whether git or an in-memory fake is behind it: the tree lands
 *   under the configured worktree root (outside the checkout), create is safe to repeat after a crash, changed-file lists
 *   cover committed, modified and untracked files but not ignored ones, the diff reports
 *   added, modified, deleted and renamed files plus a readable patch for the gates, commits carry the
 *   Forge author, removal keeps the branch, and hostile refs are refused before git sees
 *   them. A new implementation passes this before it gets tests of its own.
 *
 * Exports: WorktreeHarness, describeWorktreeContract().
 * Depends on: vitest, @forge/core (TicketId, WorktreeManager, InvalidInputError).
 */

import { InvalidInputError, TicketId } from '@forge/core';
import type { WorktreeManager } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * A manager plus the few probes the contract needs. The base repo must hold a commit on
 * `main` containing `README.md` and a `.gitignore` that ignores `*.log`.
 */
export interface WorktreeHarness {
  readonly manager: WorktreeManager;
  readonly repoRoot: string;
  /** The folder the manager was told to put ticket worktrees in (outside `repoRoot`). */
  readonly worktreeRoot: string;
  exists(path: string): Promise<boolean>;
  branchExists(branch: string): Promise<boolean>;
  /** Writes (or overwrites) a file relative to a worktree path. */
  write(worktreePath: string, relPath: string, content: string): Promise<void>;
  /** Deletes a file relative to a worktree path. */
  remove(worktreePath: string, relPath: string): Promise<void>;
  /** Renames a file relative to a worktree path. */
  rename(worktreePath: string, from: string, to: string): Promise<void>;
  /** Author name of a commit. */
  authorOf(worktreePath: string, sha: string): Promise<string>;
  close(): Promise<void>;
}

const tid = (n: number): TicketId => TicketId.parse(`FRG-${n}`);

export function describeWorktreeContract(
  name: string,
  make: () => Promise<WorktreeHarness>,
): void {
  // 30s per case: real git spawns several processes per call, slow on Windows.
  describe(`WorktreeManager contract: ${name}`, { timeout: 30_000 }, () => {
    let h: WorktreeHarness;
    beforeEach(async () => {
      h = await make();
    });

    afterEach(async () => {
      await h.close();
    });

    it('creates the worktree under the worktree root, not in the checkout, on a new branch at the base commit', async () => {
      const wt = await h.manager.create(tid(1), 'feat/FRG-1-a', 'main');

      const root = h.worktreeRoot.replaceAll('\\', '/');

      expect(wt.path.replaceAll('\\', '/')).toBe(`${root}/FRG-1`);
      expect(await h.exists(wt.path)).toBe(true);
      expect(await h.branchExists('feat/FRG-1-a')).toBe(true);
      expect(wt.baseSha).toMatch(/^[0-9a-f]{40}$/);
      expect(await h.manager.head(wt.path)).toBe(wt.baseSha);
    });

    it('is idempotent: creating again returns the same path and base', async () => {
      const first = await h.manager.create(tid(1), 'feat/FRG-1-a', 'main');
      const second = await h.manager.create(tid(1), 'feat/FRG-1-a', 'main');

      expect(second).toEqual(first);
    });

    it('refuses to reuse a ticket path for a different branch', async () => {
      await h.manager.create(tid(1), 'feat/FRG-1-a', 'main');

      await expect(h.manager.create(tid(1), 'feat/other', 'main')).rejects.toBeInstanceOf(
        InvalidInputError,
      );
    });

    it('refuses a branch already checked out in another worktree', async () => {
      await h.manager.create(tid(1), 'feat/shared', 'main');

      await expect(
        h.manager.create(tid(2), 'feat/shared', 'main'),
      ).rejects.toBeInstanceOf(InvalidInputError);
    });

    it('lists modified, untracked and committed-since-base files, not ignored ones', async () => {
      const wt = await h.manager.create(tid(1), 'feat/FRG-1-a', 'main');
      await h.write(wt.path, 'committed.txt', 'c');
      await h.manager.commitAll(wt.path, 'add committed');
      await h.write(wt.path, 'README.md', 'changed');
      await h.write(wt.path, 'src/new file.ts', 'n');
      await h.write(wt.path, 'debug.log', 'ignored');

      const files = await h.manager.changedFiles(wt.path, wt.baseSha);

      expect(files).toEqual(['README.md', 'committed.txt', 'src/new file.ts']);
    });

    it('diff reports added, modified, deleted and untracked files with a patch', async () => {
      const wt = await h.manager.create(tid(1), 'feat/FRG-1-a', 'main');
      await h.write(wt.path, 'committed.txt', 'c\n');
      await h.manager.commitAll(wt.path, 'add committed');
      await h.write(wt.path, 'README.md', 'changed\n');
      await h.remove(wt.path, '.gitignore');
      await h.write(wt.path, 'fresh.ts', 'export const x = 1;\n');

      const d = await h.manager.diff(wt.path, wt.baseSha);

      expect(d.files).toEqual([
        { status: 'D', path: '.gitignore' },
        { status: 'M', path: 'README.md' },
        { status: 'A', path: 'committed.txt' },
        { status: 'A', path: 'fresh.ts' },
      ]);

      expect(d.patch).toContain('+changed');
      expect(d.patch).toContain('+export const x = 1;');
    });

    it('diff reports a committed rename with its old path', async () => {
      const wt = await h.manager.create(tid(1), 'feat/FRG-1-a', 'main');
      await h.rename(wt.path, 'README.md', 'docs.md');
      await h.manager.commitAll(wt.path, 'rename');

      const d = await h.manager.diff(wt.path, wt.baseSha);

      expect(d.files).toEqual([{ status: 'R', path: 'docs.md', oldPath: 'README.md' }]);
    });

    it('diff is empty for a fresh worktree', async () => {
      const wt = await h.manager.create(tid(1), 'feat/FRG-1-a', 'main');

      expect(await h.manager.diff(wt.path, wt.baseSha)).toEqual({ files: [], patch: '' });
    });

    it('reports nothing for a fresh worktree', async () => {
      const wt = await h.manager.create(tid(1), 'feat/FRG-1-a', 'main');

      expect(await h.manager.changedFiles(wt.path, wt.baseSha)).toEqual([]);
    });

    it('commits everything as Forge, moves head, and returns null when clean', async () => {
      const wt = await h.manager.create(tid(1), 'feat/FRG-1-a', 'main');
      await h.write(wt.path, 'a.txt', 'a');

      const sha = await h.manager.commitAll(wt.path, 'add a');

      expect(sha).toMatch(/^[0-9a-f]{40}$/);
      expect(await h.manager.head(wt.path)).toBe(sha);
      expect(await h.authorOf(wt.path, sha as string)).toBe('Forge');
      expect(await h.manager.commitAll(wt.path, 'nothing')).toBeNull();
    });

    it('removes the directory, keeps the branch, and tolerates a second removal', async () => {
      const wt = await h.manager.create(tid(1), 'feat/FRG-1-a', 'main');
      await h.write(wt.path, 'dirty.txt', 'x');

      await h.manager.remove(wt.path);

      expect(await h.exists(wt.path)).toBe(false);
      expect(await h.branchExists('feat/FRG-1-a')).toBe(true);
      await expect(h.manager.remove(wt.path)).resolves.toBeUndefined();
    });

    it('rejects a base ref that looks like an option', async () => {
      await expect(
        h.manager.create(tid(1), 'feat/x', '--upload-pack=x'),
      ).rejects.toBeInstanceOf(InvalidInputError);
    });

    it('rejects a branch that looks like an option or is not a valid ref name', async () => {
      await expect(h.manager.create(tid(1), '-bad', 'main')).rejects.toBeInstanceOf(
        InvalidInputError,
      );

      await expect(h.manager.create(tid(1), 'bad..name', 'main')).rejects.toBeInstanceOf(
        InvalidInputError,
      );
    });
  });
}
