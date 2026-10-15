/**
 * MEMORY.md builder and id tests — the index stays small and ids never repeat.
 *
 * Why: the index is the first thing the Director and the owner read, so it must stay under
 *   its line budget however many outcomes pile up, while constraints (decisions, rejected,
 *   pending) are never dropped from it. Ids are how records are cited; an id reused after
 *   a proposal left `proposed/` would make two records answer to one name.
 *
 * Pins: buildMemoryIndex sections, outcome archiving at the budget, nextRecordId.
 * Depends on: domain/memory-index, domain/record-ids, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { buildMemoryIndex } from '#/domain/memory-index.js';
import { nextRecordId } from '#/domain/record-ids.js';
import type { IndexEntry } from '#/types/project-memory.types.js';

const entries = (prefix: string, folder: string, n: number): IndexEntry[] =>
  Array.from({ length: n }, (_, i) => {
    const id = `${prefix}-${String(i + 1).padStart(4, '0')}`;

    return { id, statement: `statement ${id}`, relPath: `${folder}/${id}.md` };
  });

const empty = {
  slug: 'shop',
  decisions: [],
  rejected: [],
  proposed: [],
  superseded: 0,
  outcomes: [],
};

const lines = (text: string): string[] => text.trimEnd().split('\n');

describe('buildMemoryIndex', () => {
  it('lists each constraint family under its own heading, with a link to the file', () => {
    const text = buildMemoryIndex({
      ...empty,
      decisions: entries('d', 'decisions', 2),
      rejected: entries('x', 'rejected', 1),
      proposed: entries('x', 'proposed', 1),
      superseded: 3,
    });

    expect(text).toContain('# Memory of shop');
    expect(text).toContain(
      '## Decisions\n- [d-0001](decisions/d-0001.md): statement d-0001',
    );

    expect(text).toContain('## Rejected approaches');
    expect(text).toContain('## Pending proposals');
    expect(text).toContain('3 superseded decision(s)');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('stays within 200 lines by archiving the oldest outcomes only', () => {
    const text = buildMemoryIndex({
      ...empty,
      decisions: entries('d', 'decisions', 20),
      outcomes: entries('o', 'outcomes/2026-10', 400),
    });

    expect(lines(text).length).toBeLessThanOrEqual(200);
    expect(text).toContain('[d-0020]');
    expect(text).toContain('[o-0400]');
    expect(text).not.toContain('[o-0001]');
    expect(text).toMatch(/\d+ older outcome\(s\) are archived/);
  });

  it('never drops a decision to make room', () => {
    const text = buildMemoryIndex({
      ...empty,
      decisions: entries('d', 'decisions', 230),
      outcomes: entries('o', 'outcomes/2026-10', 5),
    });

    expect(text).toContain('[d-0230]');
    expect(text).not.toContain('[o-0005]');
  });

  it('collapses long multi-line statements to one short line', () => {
    const text = buildMemoryIndex({
      ...empty,
      decisions: [
        {
          id: 'd-0001',
          statement: `a\n${'b'.repeat(400)}`,
          relPath: 'decisions/d-0001.md',
        },
      ],
    });

    const line = lines(text).find((l) => l.startsWith('- [d-0001]')) ?? '';
    expect(line.length).toBeLessThan(200);
    expect(line).toContain('…');
  });
});

describe('nextRecordId', () => {
  it('starts at 0001 and counts past the highest id of the family', () => {
    expect(nextRecordId('x', [])).toBe('x-0001');
    expect(nextRecordId('x', ['x-0001', 'x-0004', 'd-0099'])).toBe('x-0005');
  });

  it('ignores other families and malformed ids', () => {
    expect(nextRecordId('d', ['x-0050', 'd-12', 'd-abcd'])).toBe('d-0001');
  });
});
