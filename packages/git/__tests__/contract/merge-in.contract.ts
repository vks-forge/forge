/**
 * Contract for `WorktreeManager.mergeIn` and `contains`: `describeMergeInContract(name, make)`.
 *
 * Why: when the base branch moves while a ticket is in flight, Forge merges the new base into
 *   the ticket's branch instead of parking the ticket on a conflict nobody can act on. The
 *   engine routes on what comes back, so every implementation must tell the same three
 *   stories: nothing to do, merged cleanly, or conflicted with the damage already committed
 *   (markers in text files, the ticket's version of binary files, the ticket's side of a
 *   delete-versus-modify) and the upstream commits that explain it. Merging, never
 *   rebasing: the base tip is afterwards in the branch's history, and a second call is a no-op.
 *
 * Exports: MergeInHarness, describeMergeInContract().
 * Depends on: vitest, @forge/core (TicketId, InvalidInputError), contract/worktree.contract.
 */

import { InvalidInputError, TicketId } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WorktreeHarness } from '#tests/contract/worktree.contract.js';

/** A worktree harness that can also move the base branch and read files back. */
export interface MergeInHarness extends WorktreeHarness {
  /**
   * Commits `content` to `file` on `main` of the repository (deletes it when null) with the
   * subject `upstream: <file>`, and returns the new commit.
   */
  baseCommit(file: string, content: string | null): Promise<string>;
  /** File content relative to a worktree path, or null when the file is absent. */
  read(worktreePath: string, relPath: string): Promise<string | null>;
}

const tid = (n: number): TicketId => TicketId.parse(`FRG-${n}`);

export function describeMergeInContract(
  name: string,
  make: () => Promise<MergeInHarness>,
): void {
  describe(`WorktreeManager mergeIn contract: ${name}`, { timeout: 60_000 }, () => {
    let h: MergeInHarness;
    beforeEach(async () => {
      h = await make();
    }, 60_000);

    afterEach(async () => {
      await h.close();
    });

    const start = () => h.manager.create(tid(1), 'feat/FRG-1-a', 'main');

    /** Writes and commits one file in the ticket's tree. */
    const work = async (path: string, file: string, content: string): Promise<void> => {
      await h.write(path, file, content);
      await h.manager.commitAll(path, `ticket ${file}`);
    };

    it('is up to date when the base tip is already in the branch', async () => {
      const wt = await start();
      const head = await h.manager.head(wt.path);

      const r = await h.manager.mergeIn(wt.path, wt.baseSha, 'merge main');

      expect(r).toEqual({ kind: 'up_to_date' });
      expect(await h.manager.head(wt.path)).toBe(head);
      expect(await h.manager.contains(wt.path, wt.baseSha)).toBe(true);
    });

    it('merges a base that moved on other files, as a Forge commit, and a second call is a no-op', async () => {
      const wt = await start();
      await work(wt.path, 'ticket.txt', 'mine\n');
      const tip = await h.baseCommit('other.txt', 'theirs\n');
      expect(await h.manager.contains(wt.path, tip)).toBe(false);

      const r = await h.manager.mergeIn(wt.path, tip, 'merge main into feat');

      expect(r).toEqual({ kind: 'merged', head: await h.manager.head(wt.path) });
      expect(await h.manager.contains(wt.path, tip)).toBe(true);
      expect(await h.read(wt.path, 'other.txt')).toBe('theirs\n');
      expect(await h.read(wt.path, 'ticket.txt')).toBe('mine\n');
      expect(await h.authorOf(wt.path, (r as { head: string }).head)).toBe('Forge');
      expect(await h.manager.mergeIn(wt.path, tip, 'again')).toEqual({
        kind: 'up_to_date',
      });
    });

    it('merges a base change to a file the ticket also changed, on different lines', async () => {
      await h.baseCommit('notes.txt', 'a\nb\nc\nd\ne\nf\ng\n');
      const wt = await start();
      await work(wt.path, 'notes.txt', 'a\nb\nc\nd\ne\nf\nG-ticket\n');
      const tip = await h.baseCommit('notes.txt', 'A-base\nb\nc\nd\ne\nf\ng\n');

      const r = await h.manager.mergeIn(wt.path, tip, 'merge main');

      expect(r.kind).toBe('merged');
      expect(await h.read(wt.path, 'notes.txt')).toBe(
        'A-base\nb\nc\nd\ne\nf\nG-ticket\n',
      );
    });

    it('commits a text conflict with markers in place and names the file and the upstream commit', async () => {
      const wt = await start();
      await work(wt.path, 'README.md', 'from ticket\n');
      const tip = await h.baseCommit('README.md', 'from base\n');

      const r = await h.manager.mergeIn(wt.path, tip, 'merge main: conflicts');

      expect(r).toEqual({
        kind: 'conflict',
        head: await h.manager.head(wt.path),
        files: [{ path: 'README.md', binary: false }],
        upstream: [{ sha: tip, subject: 'upstream: README.md' }],
      });

      const text = (await h.read(wt.path, 'README.md')) ?? '';

      expect(text).toContain('<<<<<<<');
      expect(text).toContain('from ticket');
      expect(text).toContain('from base');
      expect(await h.manager.contains(wt.path, tip)).toBe(true);
      expect(await h.authorOf(wt.path, await h.manager.head(wt.path))).toBe('Forge');
    });

    it('keeps the ticket version of a conflicting binary file and lists it as binary', async () => {
      const wt = await start();
      await work(wt.path, 'logo.bin', 'ticket\0bytes');
      const tip = await h.baseCommit('logo.bin', 'base\0bytes');

      const r = await h.manager.mergeIn(wt.path, tip, 'merge main');

      expect(r).toMatchObject({
        kind: 'conflict',
        files: [{ path: 'logo.bin', binary: true }],
      });

      expect(await h.read(wt.path, 'logo.bin')).toBe('ticket\0bytes');
    });

    it('keeps the deletion when the ticket deleted a file the base changed', async () => {
      const wt = await start();
      await h.remove(wt.path, 'README.md');
      await h.manager.commitAll(wt.path, 'ticket deletes readme');
      const tip = await h.baseCommit('README.md', 'base edit\n');

      const r = await h.manager.mergeIn(wt.path, tip, 'merge main');

      expect(r).toMatchObject({
        kind: 'conflict',
        files: [{ path: 'README.md', binary: false, deletedBy: 'ticket' }],
      });

      expect(await h.read(wt.path, 'README.md')).toBeNull();
    });

    it('keeps the ticket file when the base deleted a file the ticket changed', async () => {
      const wt = await start();
      await work(wt.path, 'README.md', 'ticket edit\n');
      const tip = await h.baseCommit('README.md', null);

      const r = await h.manager.mergeIn(wt.path, tip, 'merge main');

      expect(r).toMatchObject({
        kind: 'conflict',
        files: [{ path: 'README.md', binary: false, deletedBy: 'base' }],
      });

      expect(await h.read(wt.path, 'README.md')).toBe('ticket edit\n');
    });

    it('reports a commit the branch does not hold as not contained', async () => {
      const wt = await start();
      const tip = await h.baseCommit('x.txt', 'x\n');

      expect(await h.manager.contains(wt.path, tip)).toBe(false);
    });

    it('refuses a sha that looks like an option', async () => {
      const wt = await start();

      await expect(h.manager.mergeIn(wt.path, '--abort', 'm')).rejects.toBeInstanceOf(
        InvalidInputError,
      );

      await expect(h.manager.contains(wt.path, '--all')).rejects.toBeInstanceOf(
        InvalidInputError,
      );
    });
  });
}
