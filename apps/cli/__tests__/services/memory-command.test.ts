/**
 * Pins what `forge memory` prints and which exit codes it gives, over a fake index.
 *
 * Why: the output is read by a person in a terminal and by a model in a session, so it must be short and regular:
 *   one line per hit with the id, kind, status, statement and why it matched; a record with its provenance first
 *   and its body last; a search that finds nothing says so and succeeds (exit 0) because "nothing" is an answer;
 *   an id that does not exist is an error (exit 1) naming the id. `--json` prints data for a program, the folder is
 *   found by walking up from the current folder, and the local index is closed after every command.
 *
 * Pins: hit lines and the cut at 140 characters, the "showing N of M" line, zero hits exit 0, the filters passed
 *   to the index (defaults, `--all`, kinds, tags, k), `get` printing provenance and the body notice, missing ids
 *   on stderr with exit 1, `related` lines and `nothing related`, `--json`, and the index closing.
 * Depends on: src/services/memory-command, src/types/cli, vitest. No IO.
 */

import type { MemoryIndex, MemoryRecordView, MemorySearchReply } from '@forge/core';
import { describe, expect, it, vi } from 'vitest';
import { runMemoryCommand } from '#/services/memory-command.js';
import type { MemoryCliPorts, MemoryCommand } from '#/types/cli.types.js';

const view = (over: Partial<MemoryRecordView> = {}): MemoryRecordView => ({
  id: 'd-0012',
  kind: 'decision',
  status: 'active',
  statement: 'Use zod everywhere',
  body: 'Because.',
  body_truncated: false,
  tags: ['core'],
  source: { type: 'chat', ref: 'the owner' },
  author: 'user',
  origin: 'owner',
  confidence: null,
  pinned: true,
  valid_from: '2026-10-12',
  valid_to: null,
  supersedes: null,
  superseded_by: null,
  gist: null,
  aliases: [],
  links: [{ rel: 'cites', target_kind: 'record', target: 'd-0003' }],
  imported: { from: 'decisions/d-0012.md@abc', defaulted_fields: ['author'] },
  ...over,
});

function rig(index: Partial<MemoryIndex>, dirs: string[] = ['/repo/.forge/memory']) {
  const out: string[] = [];
  const err: string[] = [];
  const close = vi.fn(async () => undefined);
  const openIndex = vi.fn(async () => ({
    index: index as MemoryIndex,
    rebuilt: false,
    close,
  }));

  const ports: MemoryCliPorts = {
    cwd: '/repo/apps/cli',
    env: {},
    isDir: async (p) => dirs.some((d) => p.replace(/\\/g, '/').endsWith(d)),
    openIndex,
  };

  return {
    ports,
    out,
    err,
    close,
    openIndex,
    sink: {
      stdout: (t: string) => void out.push(t),
      stderr: (t: string) => void err.push(t),
    },
  };
}

const search = (
  over: Partial<Extract<MemoryCommand, { kind: 'memory-search' }>> = {},
): MemoryCommand => ({
  kind: 'memory-search',
  words: ['tdd'],
  kinds: undefined,
  status: undefined,
  tags: [],
  k: 8,
  all: false,
  json: false,
  dir: undefined,
  ...over,
});

describe('search', () => {
  it('prints one line per hit and asks the index as the CLI with the defaults', async () => {
    const calls: unknown[] = [];
    const r = rig({
      search: async (q) => {
        calls.push(q);

        return {
          hits: [
            {
              id: 'd-0015',
              kind: 'decision',
              status: 'active',
              line: 'x'.repeat(200),
              tags: [],
              why: 'statement',
              score: 1,
            },
            {
              id: 'd-0003',
              kind: 'decision',
              status: 'active',
              line: 'Short',
              tags: [],
              why: 'tag',
              score: 1,
              replaced_by: 'd-0001',
            },
          ],
          total: 2,
          truncated: false,
        };
      },
    });

    const code = await runMemoryCommand(
      search({ words: ['tdd', 'red', 'green'] }) as MemoryCommand,
      r.ports,
      r.sink,
    );

    expect(code).toBe(0);
    expect(calls[0]).toEqual({
      project: 'forge',
      actor: 'cli',
      text: 'tdd red green',
      k: 8,
    });

    const lines = r.out.join('').trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(`d-0015 decision/active  ${'x'.repeat(139)}…  [statement]`);
    expect(lines[1]).toBe('d-0003 decision/active  Short (replaces d-0001)  [tag]');
    expect(r.close).toHaveBeenCalledTimes(1);
  });

  it('says no matches and still exits 0', async () => {
    const r = rig({ search: async () => ({ hits: [], total: 0, truncated: false }) });

    expect(await runMemoryCommand(search(), r.ports, r.sink)).toBe(0);
    expect(r.out.join('')).toBe('no matches\n');
  });

  it('passes kinds, status, tags and the count, and widens to everything with --all', async () => {
    const calls: Record<string, unknown>[] = [];
    const r = rig({
      search: async (q) => {
        calls.push(q as Record<string, unknown>);

        return { hits: [], total: 0, truncated: false };
      },
    });

    await runMemoryCommand(
      search({ kinds: ['rejected'], status: ['rejected'], tags: ['db'], k: 3 }),
      r.ports,
      r.sink,
    );

    await runMemoryCommand(search({ all: true }), r.ports, r.sink);

    expect(calls[0]).toMatchObject({
      kinds: ['rejected'],
      status: ['rejected'],
      tags: ['db'],
      k: 3,
    });

    expect(calls[1]?.['kinds']).toEqual(['decision', 'rejected', 'proposal', 'outcome']);
    expect(calls[1]?.['status']).toEqual(['active', 'superseded', 'pending', 'rejected']);
  });

  it('says when the list was cut and prints the reply as data with --json', async () => {
    const reply: MemorySearchReply = {
      hits: [
        {
          id: 'd-0001',
          kind: 'decision',
          status: 'active',
          line: 'L',
          tags: [],
          why: 'text',
          score: 1,
        },
      ],
      total: 9,
      truncated: true,
    };

    const r = rig({ search: async () => reply });
    await runMemoryCommand(search({ k: 1 }), r.ports, r.sink);
    expect(r.out.join('')).toContain('showing 1 of 9; use -k for more');

    const j = rig({ search: async () => reply });
    await runMemoryCommand(search({ json: true }), j.ports, j.sink);
    expect(JSON.parse(j.out.join(''))).toEqual(reply);
  });
});

describe('get and related', () => {
  it('prints a record with provenance first and the body last, and the notice when the body was cut', async () => {
    const r = rig({
      get: async () => ({ records: [view({ body_truncated: true })], missing: [] }),
    });

    const code = await runMemoryCommand(
      { kind: 'memory-get', ids: ['d-0012'], full: false, json: false, dir: undefined },
      r.ports,
      r.sink,
    );

    const text = r.out.join('');
    expect(code).toBe(0);
    expect(text.split('\n')[0]).toBe('d-0012  decision/active  pinned');
    expect(text).toContain('source: chat - the owner');
    expect(text).toContain('author: user - origin: owner - valid from 2026-10-12');
    expect(text).toContain('tags: core');
    expect(text).toContain('links: cites d-0003');
    expect(text).toContain('imported from decisions/d-0012.md@abc; filled in: author');
    expect(text.indexOf('Because.')).toBeGreaterThan(text.indexOf('imported from'));
    expect(text).toContain('use --full');
  });

  it('names a missing id on stderr and exits 1, still printing the ones it found', async () => {
    const r = rig({ get: async () => ({ records: [view()], missing: ['d-9999'] }) });

    const code = await runMemoryCommand(
      {
        kind: 'memory-get',
        ids: ['d-0012', 'd-9999'],
        full: true,
        json: false,
        dir: undefined,
      },
      r.ports,
      r.sink,
    );

    expect(code).toBe(1);
    expect(r.err.join('')).toBe('d-9999: not found\n');
    expect(r.out.join('')).toContain('d-0012');
  });

  it('prints related lines with their reasons, nothing related, and exit 1 for an unknown id', async () => {
    const some = rig({
      related: async () => [
        {
          id: 'd-0002',
          kind: 'decision',
          status: 'active',
          line: 'Amends it',
          reasons: ['amends', 'shares tags: db'],
        },
      ],
    });

    await runMemoryCommand(
      { kind: 'memory-related', id: 'd-0001', json: false, dir: undefined },
      some.ports,
      some.sink,
    );

    expect(some.out.join('')).toBe(
      'd-0002 decision/active  Amends it  (amends, shares tags: db)\n',
    );

    const none = rig({ related: async () => [] });
    await runMemoryCommand(
      { kind: 'memory-related', id: 'd-0001', json: false, dir: undefined },
      none.ports,
      none.sink,
    );

    expect(none.out.join('')).toBe('nothing related\n');

    const unknown = rig({ related: async () => null });
    expect(
      await runMemoryCommand(
        { kind: 'memory-related', id: 'd-9999', json: false, dir: undefined },
        unknown.ports,
        unknown.sink,
      ),
    ).toBe(1);

    expect(unknown.err.join('')).toBe('d-9999: not found\n');
    expect(unknown.close).toHaveBeenCalledTimes(1);
  });
});
