/**
 * Folder browser API: what the "Browse…" dialog on the new-project form reads.
 *
 * Why: a browser cannot give a page the absolute path of a folder, so the server lists folders
 *   for it. The listing must be safe to expose (names of folders only, nothing for a relative
 *   or missing path, nothing without the install token) and must help the person choose
 *   (alphabetical, repository folders marked, a place to start when no folder is named).
 *
 * Pins: each entry carries a modified time for sorting by date; sub-folders are listed case-insensitively sorted with files and hidden folders left
 *   out and `.git` folders marked as repositories; no path gives the roots view with the home
 *   folder first; a relative path, a missing path and a file path are refused with plain codes;
 *   the route needs the token.
 * Depends on: helpers/projects-rig, helpers/temp, src/routes. IO: a temp folder tree.
 */

import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FolderReveal } from '@forge/core';
import type { FolderRevealer } from '#/types/folder-picker.types.js';
import { startProjectsRig } from '#tests/helpers/projects-rig.js';
import type { ProjectsRig } from '#tests/helpers/projects-rig.js';
import { trackTemp } from '#tests/helpers/temp.js';

let root: string;
let rigs: ProjectsRig | undefined;

beforeAll(() => {
  root = trackTemp(mkdtempSync(join(tmpdir(), 'forge-folders-')));
  mkdirSync(join(root, 'beta'));
  mkdirSync(join(root, 'Alpha', '.git'), { recursive: true });
  mkdirSync(join(root, 'gamma'));
  mkdirSync(join(root, '.hidden'));
  writeFileSync(join(root, 'notes.txt'), 'not a folder');
});

afterAll(async () => {
  await rigs?.rig.close();
});

afterEach(async () => {
  await rigs?.rig.close();
  rigs = undefined;
});

const get = async (query: string) => {
  rigs = await startProjectsRig(join(root, 'data', 'worktrees'));

  return rigs.rig.json('GET', `/fs/folders${query}`);
};

describe('GET /fs/folders', () => {
  it('lists sub-folders sorted, without files or hidden folders, marking repositories', async () => {
    const res = await get(`?path=${encodeURIComponent(root)}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      path: root,
      truncated: false,
      entries: [
        { name: 'Alpha', path: join(root, 'Alpha'), is_repo: true },
        { name: 'beta', path: join(root, 'beta'), is_repo: false },
        { name: 'gamma', path: join(root, 'gamma'), is_repo: false },
      ],
    });

    expect((res.body as { parent: string | null }).parent).not.toBeNull();
  });

  it('with no path answers the roots view, home folder first', async () => {
    const res = await get('');
    const body = res.body as {
      path: string;
      parent: string | null;
      entries: { path: string }[];
    };

    expect(res.status).toBe(200);
    expect(body.path).toBe('');
    expect(body.parent).toBeNull();
    expect(body.entries[0]?.path).toBe(homedir());
    expect(body.entries.length).toBeGreaterThan(1);
  });

  it('refuses a relative path', async () => {
    const res = await get('?path=some/where');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'invalid_path' } });
  });

  it('refuses a folder that does not exist', async () => {
    const res = await get(`?path=${encodeURIComponent(join(root, 'missing'))}`);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'folder_not_found' } });
  });

  it('refuses a path that is a file', async () => {
    const res = await get(`?path=${encodeURIComponent(join(root, 'notes.txt'))}`);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'not_a_directory' } });
  });

  it('gives every folder a modified time and none to the drives', async () => {
    const res = await get(`?path=${encodeURIComponent(root)}`);
    const roots = await get('');

    const dates = (res.body as { entries: { modified_at: string | null }[] }).entries.map(
      (e) => e.modified_at,
    );

    expect(dates.every((d) => d !== null && !Number.isNaN(Date.parse(d)))).toBe(true);
    expect(
      (roots.body as { entries: { modified_at: string | null }[] }).entries.every(
        (e) => e.modified_at === null,
      ),
    ).toBe(true);
  });

  it('needs the install token like every other route', async () => {
    rigs = await startProjectsRig(join(root, 'data', 'worktrees'));
    const bare = await rigs.rig.raw('GET', '/fs/folders');

    expect([401, 403]).toContain(bare.status);
  });
});

const post = async (path: string, body: unknown, revealer?: FolderRevealer) => {
  rigs = await startProjectsRig(
    join(root, 'data', 'worktrees'),
    undefined,
    undefined,
    revealer,
  );

  return rigs.rig.json('POST', path, body);
};

describe('POST /fs/folders', () => {
  it('creates one folder and answers its entry', async () => {
    const res = await post('/fs/folders', { parent: root, name: 'fresh' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'fresh',
      path: join(root, 'fresh'),
      is_repo: false,
    });

    expect(existsSync(join(root, 'fresh'))).toBe(true);
  });

  it('refuses a name that already exists with 409', async () => {
    const res = await post('/fs/folders', { parent: root, name: 'beta' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'folder_exists' } });
  });

  it.each(['a/b', '..', 'bad:name', 'CON', 'nul.txt', 'trail.', 'trail ', ' lead', ''])(
    'refuses the unsafe name %j',
    async (name) => {
      const res = await post('/fs/folders', { parent: root, name });

      expect(res.status).toBe(400);
    },
  );

  it('refuses a relative parent, a missing parent and a file parent', async () => {
    const relative = await post('/fs/folders', { parent: 'some/where', name: 'x' });
    const missing = await post('/fs/folders', { parent: join(root, 'nope'), name: 'x' });
    const file = await post('/fs/folders', {
      parent: join(root, 'notes.txt'),
      name: 'x',
    });

    expect(relative.body).toMatchObject({ error: { code: 'invalid_path' } });
    expect(missing.status).toBe(404);
    expect(file.body).toMatchObject({ error: { code: 'not_a_directory' } });
  });

  it('refuses an unknown body field', async () => {
    const res = await post('/fs/folders', { parent: root, name: 'z', extra: 1 });

    expect(res.status).toBe(400);
  });

  it('needs the install token', async () => {
    rigs = await startProjectsRig(join(root, 'data', 'worktrees'));
    const bare = await rigs.rig.raw('POST', '/fs/folders');

    expect([401, 403]).toContain(bare.status);
  });
});

describe('POST /fs/reveal', () => {
  const revealer = (answer: FolderReveal) => ({
    reveal: vi.fn<FolderRevealer['reveal']>(async () => answer),
  });

  it('hands the folder to the file manager', async () => {
    const fake = revealer({ status: 'opened' });

    const res = await post('/fs/reveal', { path: root }, fake);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'opened' });
    expect(fake.reveal).toHaveBeenCalledWith(root);
  });

  it('answers unavailable when the server has no file manager', async () => {
    const res = await post('/fs/reveal', { path: root });

    expect(res.body).toMatchObject({ status: 'unavailable' });
  });

  it('refuses an unknown field and needs the token', async () => {
    const odd = await post(
      '/fs/reveal',
      { path: root, x: 1 },
      revealer({ status: 'opened' }),
    );

    const bare = await rigs?.rig.raw('POST', '/fs/reveal');

    expect(odd.status).toBe(400);
    expect([401, 403]).toContain(bare?.status);
  });
});
