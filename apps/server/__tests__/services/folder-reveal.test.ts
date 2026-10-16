/**
 * Folder reveal: how "Show in Explorer" in the folder browser starts the OS file manager.
 *
 * Why: the right-click menu must open the right program for each OS with the folder as one
 *   plain argument (a folder name must never become a command), must not report a failure when
 *   Windows Explorer exits 1 after opening the window, and must turn a missing file manager into
 *   a quiet "unavailable" the page words as a note. No test opens a real window: the command
 *   runner is a fake.
 *
 * Pins: per-platform program, the path passed as the single argument, Explorer's exit 1 is
 *   success, a missing program or a failing non-Windows exit is unavailable, relative, missing
 *   and file paths are refused.
 * Depends on: src/services/folder-reveal, helpers/temp. IO: a temp folder.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createFolderRevealer } from '#/services/folder-reveal.js';
import type { CommandResult, CommandRunner } from '#/types/folder-picker.types.js';
import { trackTemp } from '#tests/helpers/temp.js';

const OK: CommandResult = {
  code: 0,
  stdout: '',
  stderr: '',
  missing: false,
  timedOut: false,
};

const folder = trackTemp(mkdtempSync(join(tmpdir(), 'forge-reveal-')));

const runner = (result: Partial<CommandResult> = {}) =>
  vi.fn<CommandRunner>(async () => ({ ...OK, ...result }));

describe('folder revealer', () => {
  it.each([
    ['win32', 'explorer.exe'],
    ['darwin', 'open'],
    ['linux', 'xdg-open'],
  ] as const)(
    'on %s runs %s with the folder as the only argument',
    async (platform, program) => {
      const run = runner();

      const answer = await createFolderRevealer({ platform, run }).reveal(folder);

      expect(answer).toEqual({ status: 'opened' });
      expect(run).toHaveBeenCalledWith(program, [folder]);
    },
  );

  it('treats Explorer exiting with 1 as opened', async () => {
    const answer = await createFolderRevealer({
      platform: 'win32',
      run: runner({ code: 1 }),
    }).reveal(folder);

    expect(answer).toEqual({ status: 'opened' });
  });

  it('reports a missing file manager as unavailable', async () => {
    const answer = await createFolderRevealer({
      platform: 'linux',
      run: runner({ missing: true, code: null }),
    }).reveal(folder);

    expect(answer).toMatchObject({ status: 'unavailable' });
  });

  it('reports a failing exit on Unix as unavailable with the first line of stderr', async () => {
    const answer = await createFolderRevealer({
      platform: 'linux',
      run: runner({ code: 3, stderr: 'no display\nmore' }),
    }).reveal(folder);

    expect(answer).toEqual({ status: 'unavailable', reason: 'no display' });
  });

  it('refuses a relative path, a missing folder and a file without running anything', async () => {
    const run = runner();
    const revealer = createFolderRevealer({ platform: 'linux', run });
    const file = join(folder, 'a.txt');
    writeFileSync(file, 'x');

    await expect(revealer.reveal('rel/path')).rejects.toMatchObject({ status: 400 });
    await expect(revealer.reveal(join(folder, 'gone'))).rejects.toMatchObject({
      status: 404,
    });

    await expect(revealer.reveal(file)).rejects.toMatchObject({
      code: 'not_a_directory',
    });

    expect(run).not.toHaveBeenCalled();
  });
});
