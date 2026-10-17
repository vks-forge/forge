/**
 * The trace file writer: layout, buffering, size cap, midnight roll-over and retention.
 *
 * Why: the trace is only useful if the files are where the owner expects (one file per local
 *   day plus one per card), complete, one JSON object per line, and if a long-running dev
 *   server neither fills the disk nor ever blocks or fails the engine because of its log
 *   (d-0163). A single oversized entry (a whole file read by a tool) must be cut, not dropped,
 *   and a write error must warn once and keep going.
 *
 * Pins: day and card files, no card file without a card, LF-separated UTF-8 lines, buffered
 *   until flush or the timer, nothing created before the first entry, 2 MB cap with marker on
 *   the biggest string, roll-over across local midnight, pruning by mtime, hostile card ids
 *   kept inside the folder, one warning on write failure.
 * Depends on: src/services/trace/writer, a fake clock, a temp dir. IO: temp files.
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  utimesSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import type { TraceEntry } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { createTraceWriter } from '#/services/trace/writer.js';
import { makeTempDir } from '#tests/helpers/temp.js';

function fakeClock(start: number) {
  let now = start;
  const timers: { at: number; fn: () => void; live: boolean }[] = [];

  return {
    now: () => now,
    after(ms: number, fn: () => void) {
      const t = { at: now + ms, fn, live: true };
      timers.push(t);

      return () => {
        t.live = false;
      };
    },
    advance(ms: number) {
      now += ms;
      for (const t of timers.filter((x) => x.live && x.at <= now)) {
        t.live = false;
        t.fn();
      }
    },
  };
}

const at = (y: number, mo: number, d: number, h = 12, mi = 0, s = 0) =>
  new Date(y, mo - 1, d, h, mi, s).getTime();

const entryAt = (ms: number, extra: Partial<TraceEntry> = {}): TraceEntry => ({
  ts: new Date(ms).toISOString(),
  seq: 1,
  level: 'info',
  kind: 'card',
  actor: 'owner',
  message: 'hello',
  data: {},
  ...extra,
});

const lines = (path: string) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);

function rig(over: Record<string, unknown> = {}) {
  const dir = join(makeTempDir('forge-trace-'), 'trace');
  const clock = fakeClock(at(2026, 10, 17));
  const warnings: string[] = [];
  const writer = createTraceWriter({
    dir,
    keepDays: 14,
    clock,
    stderr: (t) => warnings.push(t),
    ...over,
  });

  return { dir, clock, warnings, writer };
}

describe('trace writer: layout', () => {
  it('creates nothing until the first entry', async () => {
    const { dir, writer } = rig();
    await writer.flush();

    expect(existsSync(dir)).toBe(false);
  });

  it('writes the day file and the card file, one JSON object per LF-ended line', async () => {
    const { dir, clock, writer } = rig();
    writer.write(entryAt(clock.now(), { message: 'a é' }), 'FG-C1');
    writer.write(entryAt(clock.now(), { message: 'b' }));
    await writer.flush();

    const day = join(dir, 'forge-2026-10-17.jsonl');
    expect(lines(day).map((l) => l['message'])).toEqual(['a é', 'b']);
    expect(lines(join(dir, 'cards', 'FG-C1.jsonl')).map((l) => l['message'])).toEqual([
      'a é',
    ]);

    expect(readFileSync(day, 'utf8')).not.toContain('\r');
    expect(readFileSync(day, 'utf8').endsWith('\n')).toBe(true);
  });

  it('keeps a hostile card id inside the cards folder', async () => {
    const { dir, clock, writer } = rig();
    writer.write(entryAt(clock.now()), '../../evil');
    await writer.flush();

    expect(readdirSync(join(dir, 'cards'))).toHaveLength(1);
    expect(existsSync(join(dir, '..', 'evil.jsonl'))).toBe(false);
  });

  it('buffers until the flush timer fires', async () => {
    const { dir, clock, writer } = rig();
    writer.write(entryAt(clock.now()));

    expect(existsSync(dir)).toBe(false);
    clock.advance(250);
    await writer.flush();

    expect(lines(join(dir, 'forge-2026-10-17.jsonl'))).toHaveLength(1);
  });

  it('flushes what is left on close', async () => {
    const { dir, clock, writer } = rig();
    writer.write(entryAt(clock.now()));
    await writer.close();

    expect(lines(join(dir, 'forge-2026-10-17.jsonl'))).toHaveLength(1);
  });
});

describe('trace writer: size cap', () => {
  it('cuts the biggest string and marks it, keeping a valid line under the cap', async () => {
    const { dir, clock, writer } = rig({ maxEntryBytes: 10_000 });
    writer.write(
      entryAt(clock.now(), { data: { big: 'x'.repeat(50_000), small: 'keep' } }),
    );

    await writer.flush();

    const [line] = lines(join(dir, 'forge-2026-10-17.jsonl'));
    const data = line?.['data'] as { big: string; small: string };

    expect(data.small).toBe('keep');
    expect(data.big).toMatch(/…\[truncated \d+ bytes\]$/);
    expect(Buffer.byteLength(JSON.stringify(line))).toBeLessThanOrEqual(10_000);
  });
});

describe('trace writer: roll-over', () => {
  it('starts a new day file for an entry after local midnight', async () => {
    const { dir, writer } = rig();
    writer.write(entryAt(at(2026, 10, 17, 23, 59, 59), { message: 'late' }));
    writer.write(entryAt(at(2026, 10, 18, 0, 0, 1), { message: 'early' }));
    await writer.flush();

    expect(lines(join(dir, 'forge-2026-10-17.jsonl')).map((l) => l['message'])).toEqual([
      'late',
    ]);

    expect(lines(join(dir, 'forge-2026-10-18.jsonl')).map((l) => l['message'])).toEqual([
      'early',
    ]);
  });
});

describe('trace writer: retention', () => {
  const old = (path: string, ms: number) => {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, '{}\n');
    utimesSync(path, new Date(ms), new Date(ms));
  };

  it('deletes day and card files older than keepDays and keeps newer ones', async () => {
    const { dir, clock, writer } = rig();
    const day = 86_400_000;
    old(join(dir, 'forge-2026-09-01.jsonl'), clock.now() - 20 * day);
    old(join(dir, 'cards', 'OLD-C1.jsonl'), clock.now() - 15 * day);
    old(join(dir, 'forge-2026-10-10.jsonl'), clock.now() - 7 * day);
    old(join(dir, 'notes.txt'), clock.now() - 40 * day);

    const removed = await writer.prune();

    expect(removed).toBe(2);
    expect(existsSync(join(dir, 'forge-2026-09-01.jsonl'))).toBe(false);
    expect(existsSync(join(dir, 'cards', 'OLD-C1.jsonl'))).toBe(false);
    expect(existsSync(join(dir, 'forge-2026-10-10.jsonl'))).toBe(true);
    expect(existsSync(join(dir, 'notes.txt'))).toBe(true);
  });

  it('prunes again once a day on the clock', async () => {
    const { dir, clock, writer } = rig();
    writer.start();
    const day = 86_400_000;
    old(join(dir, 'forge-2026-08-01.jsonl'), clock.now() - 60 * day);
    clock.advance(day + 1);
    await writer.flush();
    await new Promise((r) => setTimeout(r, 50));

    expect(existsSync(join(dir, 'forge-2026-08-01.jsonl'))).toBe(false);
  });
});

describe('trace writer: failure', () => {
  it('warns once on stderr when the folder cannot be written and keeps accepting entries', async () => {
    const root = makeTempDir('forge-trace-bad-');
    const blocker = join(root, 'file');
    writeFileSync(blocker, 'x');
    const { clock, warnings, writer } = rig({ dir: join(blocker, 'trace') });

    writer.write(entryAt(clock.now()));
    await writer.flush();
    writer.write(entryAt(clock.now()));
    await writer.flush();

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('trace');
  });
});
