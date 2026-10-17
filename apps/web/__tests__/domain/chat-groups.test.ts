/**
 * Pins: a transcript is grouped so the author and time show once per run of consecutive
 * messages, a different author, a gap over five minutes, an event line in between or a new day
 * starts a new group, and each new day gets a separator labelled Today, Yesterday or a date.
 *
 * Why: a chat that repeats a header over every line is noise and one that never says who spoke
 *   is unreadable; both card chat and the Worker thread rely on this one function, so its
 *   edges (first line, midnight, events between speech) are pinned here without a browser.
 * Depends on: src/domain/chat-groups. Pure; timestamps are built in local time so the test does
 *   not depend on the machine's zone.
 */

import { describe, expect, it } from 'vitest';
import { dayLabel, groupChat, GROUP_GAP_MS } from '#/domain/chat-groups.js';

const at = (day: number, hour: number, minute = 0): string =>
  new Date(2026, 9, day, hour, minute).toISOString();

const NOW = new Date(2026, 9, 16, 15).getTime();

describe('groupChat', () => {
  it('shows the header once for consecutive messages from one author', () => {
    const metas = groupChat(
      [
        { at: at(16, 10, 0), author: 'owner' },
        { at: at(16, 10, 1), author: 'owner' },
        { at: at(16, 10, 2), author: 'owner' },
      ],
      NOW,
    );

    expect(metas.map((m) => m.header)).toEqual([true, false, false]);
  });

  it('starts a new group when the author changes', () => {
    const metas = groupChat(
      [
        { at: at(16, 10, 0), author: 'owner' },
        { at: at(16, 10, 1), author: 'director' },
        { at: at(16, 10, 2), author: 'owner' },
      ],
      NOW,
    );

    expect(metas.map((m) => m.header)).toEqual([true, true, true]);
  });

  it('starts a new group after a gap longer than five minutes, not at exactly five', () => {
    const edge = new Date(2026, 9, 16, 10, 0).getTime() + GROUP_GAP_MS;
    const metas = groupChat(
      [
        { at: at(16, 10, 0), author: 'owner' },
        { at: new Date(edge).toISOString(), author: 'owner' },
        { at: new Date(edge + GROUP_GAP_MS + 1000).toISOString(), author: 'owner' },
      ],
      NOW,
    );

    expect(metas.map((m) => m.header)).toEqual([true, false, true]);
  });

  it('breaks a group at an event line and gives the event no header', () => {
    const metas = groupChat(
      [
        { at: at(16, 10, 0), author: 'director' },
        { at: at(16, 10, 1), author: null },
        { at: at(16, 10, 2), author: 'director' },
      ],
      NOW,
    );

    expect(metas.map((m) => m.header)).toEqual([true, false, true]);
  });

  it('adds a day separator on the first line and whenever the day changes', () => {
    const metas = groupChat(
      [
        { at: at(15, 23, 58), author: 'owner' },
        { at: at(15, 23, 59), author: 'owner' },
        { at: at(16, 0, 1), author: 'owner' },
      ],
      NOW,
    );

    expect(metas.map((m) => m.day)).toEqual(['Yesterday', null, 'Today']);
    // Midnight starts a new group even though only two minutes passed.
    expect(metas.map((m) => m.header)).toEqual([true, false, true]);
  });

  it('survives an unreadable timestamp without a separator or a crash', () => {
    const metas = groupChat([{ at: 'not a date', author: 'owner' }], NOW);

    expect(metas[0]).toEqual({ header: true, day: null });
  });
});

describe('dayLabel', () => {
  it('says Today and Yesterday, then a short date, with the year only when it differs', () => {
    expect(dayLabel(at(16, 9), NOW)).toBe('Today');
    expect(dayLabel(at(15, 9), NOW)).toBe('Yesterday');
    expect(dayLabel(at(10, 9), NOW)).toMatch(/10/);
    expect(dayLabel(at(10, 9), NOW)).not.toMatch(/2026/);
    expect(dayLabel(new Date(2025, 5, 3, 9).toISOString(), NOW)).toMatch(/2025/);
  });
});
