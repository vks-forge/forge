/**
 * Inbox harness items against in-memory storage: only the current build of each harness.
 *
 * Why: every harness build Forge has seen keeps its tool rows, but only the installed build
 *   is run and judged by tool policy. A pending tool or failed check on an older build cannot
 *   be acted on, so listing it left the owner a "Needs action" badge that never cleared, and
 *   a pending tool with no decision time showed as 1970.
 *
 * Pins: pending tools and compat failures of superseded builds are hidden from the list and
 *   the counts; the installed build wins over the newest checked one; a pending tool is dated
 *   by its build's check time.
 * Depends on: helpers/read-rig. IO: a loopback socket.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startReadRig } from '#tests/helpers/read-rig.js';
import type { ReadRig } from '#tests/helpers/read-rig.js';

let t: ReadRig;

const get = (path: string) => t.rig.json('GET', path);

interface Item {
  id: string;
  kind: string;
  updated_at: string;
}

const ids = async (view: string): Promise<string[]> =>
  (
    (await get(`/projects/fixture/inbox?view=${view}`)).body as { items: Item[] }
  ).items.map((i) => i.id);

beforeEach(async () => {
  t = await startReadRig();
});

afterEach(async () => {
  await t.close();
});

describe('harness build items follow the current build only', () => {
  const sha = `sha256:${'0'.repeat(64)}`;
  const seed = (version: string, compat: 'pass' | 'fail', checkedAt: string) =>
    t.storage.transaction(async (tx) => {
      await tx.harnessVersions.upsert({
        kind: 'claude',
        version,
        compat,
        checked_at: checkedAt,
      } as never);

      for (const tool of ['write', 'task']) {
        await tx.harnessToolSchemas.upsert({
          harness_kind: 'claude',
          version,
          tool,
          schema_hash: sha,
          status: 'pending',
        } as never);
      }
    });

  const toolIds = async () =>
    (await ids('all')).filter((i) => i.startsWith('tool_approval:'));

  it('hides pending tools of an older build when a newer build was checked', async () => {
    await seed('2.1.300', 'pass', '2026-10-15T00:00:00.000Z');
    await seed('2.1.301', 'pass', '2026-10-16T00:00:00.000Z');
    await t.storage.transaction(async (tx) => {
      for (const tool of ['write', 'task']) {
        const row = await tx.harnessToolSchemas.get('claude', '2.1.301', tool);
        await tx.harnessToolSchemas.upsert({ ...row, status: 'approved' } as never);
      }
    });

    expect(await toolIds()).toEqual([]);
    expect((await get('/projects/fixture/inbox/counts')).body).toMatchObject({
      needs_action: 0,
    });
  });

  it('lists pending tools of the newest build dated by its check time', async () => {
    await seed('2.1.300', 'pass', '2026-10-15T00:00:00.000Z');
    await seed('2.1.301', 'pass', '2026-10-16T00:00:00.000Z');

    const page = (await get('/projects/fixture/inbox?view=all')).body as {
      items: Item[];
    };

    const tools = page.items.filter((i) => i.kind === 'tool_approval');

    expect(tools.map((i) => i.id).sort()).toEqual([
      'tool_approval:claude/2.1.301/task',
      'tool_approval:claude/2.1.301/write',
    ]);

    expect(tools.every((i) => i.updated_at === '2026-10-16T00:00:00.000Z')).toBe(true);
    expect((await get('/projects/fixture/inbox/counts')).body).toMatchObject({
      needs_action: 2,
    });
  });

  it('prefers the installed build over the newest checked one', async () => {
    await seed('2.1.300', 'pass', '2026-10-15T00:00:00.000Z');
    await seed('2.1.301', 'pass', '2026-10-16T00:00:00.000Z');
    t.installed['claude'] = '2.1.300';

    expect((await toolIds()).every((i) => i.includes('/2.1.300/'))).toBe(true);
    expect(await toolIds()).toHaveLength(2);
  });

  it('hides a compat failure on an old build once the current build passes', async () => {
    await seed('2.1.300', 'fail', '2026-10-15T00:00:00.000Z');
    await seed('2.1.301', 'pass', '2026-10-16T00:00:00.000Z');

    expect(await ids('all')).not.toContain('harness_compat:claude/2.1.300');

    t.installed['claude'] = '2.1.300';

    expect(await ids('all')).toContain('harness_compat:claude/2.1.300');
  });
});
