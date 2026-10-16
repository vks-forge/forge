/**
 * Pins: notification rules: lifetime per tone, which cards are visible (running tasks pinned) and the stack geometry.
 *
 * Why: an error that vanishes while the user looks away, a running job pushed out by a burst of
 *   toasts, or cards that overlap when fanned out would each make the system untrustworthy.
 *   These rules are pure, so they are pinned without a DOM.
 * Depends on: domain/notify-config, types/notify.types.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFY_CONFIG,
  PEEK_PX,
  resolveDuration,
  resolveNotifyConfig,
  selectVisible,
  stackHeight,
  stackOffset,
  stackScale,
} from '#/domain/notify-config.js';
import type { NotifyItem, NotifyTone } from '#/types/notify.types.js';

function item(id: string, tone: NotifyTone, task = false): NotifyItem {
  return { id, tone, title: id, dismissible: true, task, revision: 1 };
}

describe('resolveDuration', () => {
  it.each([
    ['success', 4000],
    ['info', 4000],
    ['warning', 6000],
    ['error', null],
    ['loading', null],
  ] as const)('%s lives %s ms by default', (tone, expected) => {
    expect(resolveDuration(item('a', tone), DEFAULT_NOTIFY_CONFIG)).toBe(expected);
  });

  it('prefers the notification own duration, including null for "stay"', () => {
    expect(
      resolveDuration({ ...item('a', 'success'), duration: null }, DEFAULT_NOTIFY_CONFIG),
    ).toBeNull();

    expect(
      resolveDuration({ ...item('a', 'error'), duration: 100 }, DEFAULT_NOTIFY_CONFIG),
    ).toBe(100);
  });

  it('uses the provider durations when configured', () => {
    const config = resolveNotifyConfig({ defaultDuration: { success: 900 } });

    expect(resolveDuration(item('a', 'success'), config)).toBe(900);
    expect(resolveDuration(item('a', 'warning'), config)).toBe(6000);
  });
});

describe('resolveNotifyConfig', () => {
  it('defaults to bottom-centre with three visible', () => {
    expect(resolveNotifyConfig()).toMatchObject({ position: 'bottom-center', max: 3 });
  });

  it('never allows fewer than one visible', () => {
    expect(resolveNotifyConfig({ max: 0 }).max).toBe(1);
  });
});

describe('selectVisible', () => {
  it('keeps the newest `max` one-off notifications', () => {
    const items = ['a', 'b', 'c', 'd'].map((id) => item(id, 'success'));

    expect(selectVisible(items, 2).map((i) => i.id)).toEqual(['c', 'd']);
  });

  it('pins running tasks regardless of max, in their place', () => {
    const items = [
      item('job', 'loading', true),
      item('a', 'success'),
      item('b', 'success'),
      item('c', 'success'),
    ];

    expect(selectVisible(items, 1).map((i) => i.id)).toEqual(['job', 'c']);
  });

  it('treats a finished task like any other notification', () => {
    const items = [item('job', 'success', true), item('a', 'info'), item('b', 'info')];

    expect(selectVisible(items, 2).map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('stack geometry', () => {
  const heights = [60, 80, 40];

  it('collapsed: older cards peek by a fixed amount and shrink', () => {
    expect(stackOffset(2, heights, false, 8)).toBe(2 * PEEK_PX);
    expect(stackScale(1, false)).toBeLessThan(1);
    expect(stackHeight(heights, false, 8)).toBe(60 + 2 * PEEK_PX);
  });

  it('expanded: cards are separated by the heights of the newer ones plus the gap', () => {
    expect(stackOffset(0, heights, true, 8)).toBe(0);
    expect(stackOffset(2, heights, true, 8)).toBe(60 + 8 + 80 + 8);
    expect(stackScale(2, true)).toBe(1);
    expect(stackHeight(heights, true, 8)).toBe(60 + 80 + 40 + 16);
  });

  it('an empty stack has no height', () => {
    expect(stackHeight([], true, 8)).toBe(0);
  });
});
