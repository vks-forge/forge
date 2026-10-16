/**
 * The folder picker as a whole: platform lookup, command lines, one window at a time.
 *
 * Why: the picker decides which program runs on which OS and what it is told. A fake command
 *   runner records that, so no window opens. A second click while a window is open must be
 *   refused, and a start folder that is relative or missing must never reach a program.
 *
 * Pins: win32 runs PowerShell with the start folder in the environment, not the script;
 *   darwin runs osascript; linux falls back from zenity to kdialog and reports neither
 *   installed as unavailable; no desktop session is unavailable; a busy picker throws 409
 *   `picker_busy` and frees itself after; a bad start is dropped; a throwing runner becomes
 *   unavailable.
 * Depends on: src/services/folder-picker, helpers/temp. IO: a temp folder.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createFolderPicker } from '#/services/folder-picker/index.js';
import { WIN32_PICKER_SCRIPT } from '#/services/folder-picker/win32-script.js';
import type { CommandResult, CommandRunner } from '#/types/folder-picker.types.js';
import { trackTemp } from '#tests/helpers/temp.js';

const done = (over: Partial<CommandResult> = {}): CommandResult => ({
  code: 0,
  stdout: '',
  stderr: '',
  missing: false,
  timedOut: false,
  ...over,
});

const desktop = { DISPLAY: ':0' };

describe('createFolderPicker', () => {
  it('on Windows runs PowerShell and passes the start folder through the environment', async () => {
    const start = trackTemp(mkdtempSync(join(tmpdir(), 'forge-start-')));
    const run = vi.fn<CommandRunner>(async () => done({ stdout: 'C:\\repo\r\n' }));

    const out = await createFolderPicker({ platform: 'win32', run }).pick(start);

    expect(out).toEqual({ status: 'picked', path: 'C:\\repo' });
    const [file, args, env] = run.mock.calls[0]!;
    expect(file).toBe('powershell.exe');
    expect(args).toContain('-STA');
    expect(Buffer.from(args.at(-1)!, 'base64').toString('utf16le')).toBe(
      WIN32_PICKER_SCRIPT,
    );

    expect(env).toEqual({ FORGE_PICK_START: start });
    expect(WIN32_PICKER_SCRIPT).not.toContain(start);
  });

  it('on macOS runs osascript', async () => {
    const run = vi.fn<CommandRunner>(async () => done({ stdout: '/Users/me/app/\n' }));

    const out = await createFolderPicker({ platform: 'darwin', run }).pick();

    expect(out).toEqual({ status: 'picked', path: '/Users/me/app' });
    expect(run.mock.calls[0]![0]).toBe('osascript');
  });

  it('on Linux falls back from zenity to kdialog', async () => {
    const run = vi.fn<CommandRunner>(async (file) =>
      file === 'zenity'
        ? done({ code: null, missing: true })
        : done({ stdout: '/home/me/app\n' }),
    );

    const out = await createFolderPicker({ platform: 'linux', run, env: desktop }).pick();

    expect(out).toEqual({ status: 'picked', path: '/home/me/app' });
    expect(run.mock.calls.map((c) => c[0])).toEqual(['zenity', 'kdialog']);
  });

  it('on Linux with neither tool answers unavailable', async () => {
    const run: CommandRunner = async () => done({ code: null, missing: true });

    const out = await createFolderPicker({ platform: 'linux', run, env: desktop }).pick();

    expect(out.status).toBe('unavailable');
  });

  it('on Linux with no desktop session answers unavailable without running anything', async () => {
    const run = vi.fn<CommandRunner>(async () => done());

    const out = await createFolderPicker({ platform: 'linux', run, env: {} }).pick();

    expect(out.status).toBe('unavailable');
    expect(run).not.toHaveBeenCalled();
  });

  it('drops a start folder that is relative or missing', async () => {
    const run = vi.fn<CommandRunner>(async () => done());
    const picker = createFolderPicker({ platform: 'win32', run });

    await picker.pick('relative/path');
    await picker.pick(join(tmpdir(), 'forge-does-not-exist-xyz'));

    expect(run.mock.calls.map((c) => c[2])).toEqual([
      { FORGE_PICK_START: '' },
      { FORGE_PICK_START: '' },
    ]);
  });

  it('refuses a second window while one is open, then frees itself', async () => {
    const open: ((r: CommandResult) => void)[] = [];
    const run: CommandRunner = () => new Promise((resolve) => open.push(resolve));
    const picker = createFolderPicker({ platform: 'win32', run });

    const first = picker.pick();
    await expect(picker.pick()).rejects.toMatchObject({
      status: 409,
      code: 'picker_busy',
    });

    await vi.waitFor(() => expect(open).toHaveLength(1));
    open[0]!(done({ stdout: 'C:\a' }));
    await first;

    const next = picker.pick();
    await vi.waitFor(() => expect(open).toHaveLength(2));
    open[1]!(done());
    expect(await next).toEqual({ status: 'cancelled' });
  });

  it('turns a runner that throws into unavailable and frees the picker', async () => {
    const picker = createFolderPicker({
      platform: 'win32',
      run: async () => {
        throw new Error('spawn exploded');
      },
    });

    expect(await picker.pick()).toEqual({
      status: 'unavailable',
      reason: 'spawn exploded',
    });

    expect((await picker.pick()).status).toBe('unavailable');
  });
});
