/**
 * System folder window API: what `POST /fs/pick-folder` answers the "Browse…" button.
 *
 * Why: the route opens a window on the person's desktop, so it must only run for a caller
 *   holding the install token, must tell the page apart "picked", "closed without choosing" and
 *   "no window possible here" (the last sends the page to its own browser), and must refuse a
 *   second click while a window is open. A fake picker stands in: no test opens a real window.
 *
 * Pins: picked, cancelled and unavailable are answered as 200 bodies; the typed start folder
 *   reaches the picker; a busy picker is a 409 `picker_busy`; an unknown body field is a 400;
 *   no token is refused; without a picker the answer is `unavailable`.
 * Depends on: helpers/projects-rig, helpers/temp, src/services/http/http-errors. IO: a loopback socket.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FolderPick } from '@forge/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '#/services/http/http-errors.js';
import type { FolderPicker } from '#/types/folder-picker.types.js';
import { startProjectsRig } from '#tests/helpers/projects-rig.js';
import type { ProjectsRig } from '#tests/helpers/projects-rig.js';
import { trackTemp } from '#tests/helpers/temp.js';

let rigs: ProjectsRig | undefined;

afterEach(async () => {
  await rigs?.rig.close();
  rigs = undefined;
});

const post = async (picker: FolderPicker | undefined, body: unknown = {}) => {
  const root = trackTemp(mkdtempSync(join(tmpdir(), 'forge-pick-')));
  rigs = await startProjectsRig(join(root, 'worktrees'), undefined, picker);

  return rigs.rig.json('POST', '/fs/pick-folder', body);
};

const answering = (pick: FolderPick) => ({
  pick: vi.fn<FolderPicker['pick']>(async () => pick),
});

describe('POST /fs/pick-folder', () => {
  it('answers the folder the person picked', async () => {
    const picker = answering({ status: 'picked', path: '/work/app' });

    const res = await post(picker, { start: '/work' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'picked', path: '/work/app' });
    expect(picker.pick).toHaveBeenCalledWith('/work');
  });

  it('answers cancelled when the window was closed without a choice', async () => {
    const res = await post(answering({ status: 'cancelled' }));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'cancelled' });
  });

  it('answers unavailable as a normal 200 so the page can fall back', async () => {
    const res = await post(answering({ status: 'unavailable', reason: 'no desktop' }));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'unavailable', reason: 'no desktop' });
  });

  it('answers unavailable when the server has no picker', async () => {
    const res = await post(undefined);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'unavailable' });
  });

  it('refuses a second window with 409 picker_busy', async () => {
    const res = await post({
      pick: async () => {
        throw new HttpError(409, 'picker_busy', 'already open');
      },
    });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'picker_busy' } });
  });

  it('refuses a body with an unknown field', async () => {
    const picker = answering({ status: 'cancelled' });

    const res = await post(picker, { start: '/work', command: 'calc' });

    expect(res.status).toBe(400);
    expect(picker.pick).not.toHaveBeenCalled();
  });

  it('needs the install token like every other route', async () => {
    const picker = answering({ status: 'cancelled' });
    const root = trackTemp(mkdtempSync(join(tmpdir(), 'forge-pick-')));
    rigs = await startProjectsRig(join(root, 'worktrees'), undefined, picker);

    const bare = await rigs.rig.raw('POST', '/fs/pick-folder');

    expect([401, 403]).toContain(bare.status);
    expect(picker.pick).not.toHaveBeenCalled();
  });
});
