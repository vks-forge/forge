/**
 * Notification defaults and the pure rules behind the stack: how long a tone lives, which
 * notifications are visible, and where each card sits.
 *
 * Why: a success the user already saw should leave on its own, but an error must wait because
 *   they may be looking away, and a running job must never vanish. Keeping those rules, and
 *   the stack geometry, out of the components makes them testable without a DOM and the same
 *   for every caller.
 *
 * Exports: DEFAULT_NOTIFY_CONFIG, resolveNotifyConfig(), resolveDuration(), selectVisible(),
 *   isRunningTask(), stackOffset(), stackScale(), stackHeight(), PEEK_PX.
 * Depends on: types/notify.types. No IO.
 */

import type {
  NotifyConfig,
  NotifyConfigInput,
  NotifyItem,
} from '#/types/notify.types.js';

/** How much of each older card peeks out from behind the newest when the stack is collapsed. */
export const PEEK_PX = 12;

const SCALE_STEP = 0.05;

export const DEFAULT_NOTIFY_CONFIG: NotifyConfig = {
  position: 'bottom-center',
  max: 3,
  defaultDuration: {
    success: 4000,
    info: 4000,
    warning: 6000,
    error: null,
    loading: null,
  },
  gap: 8,
  offset: 16,
};

export function resolveNotifyConfig(input: NotifyConfigInput = {}): NotifyConfig {
  return {
    position: input.position ?? DEFAULT_NOTIFY_CONFIG.position,
    max: Math.max(1, input.max ?? DEFAULT_NOTIFY_CONFIG.max),
    defaultDuration: {
      ...DEFAULT_NOTIFY_CONFIG.defaultDuration,
      ...input.defaultDuration,
    },
    gap: input.gap ?? DEFAULT_NOTIFY_CONFIG.gap,
    offset: input.offset ?? DEFAULT_NOTIFY_CONFIG.offset,
  };
}

/** Milliseconds until the item leaves, or `null` when it stays until dismissed. */
export function resolveDuration(item: NotifyItem, config: NotifyConfig): number | null {
  if (item.duration !== undefined) {
    return item.duration;
  }

  return config.defaultDuration[item.tone];
}

/** A task that is still working: pinned to the stack, never auto-dismissed. */
export function isRunningTask(item: NotifyItem): boolean {
  return item.task && item.tone === 'loading';
}

/** Running tasks always show; of the rest, only the newest `max`. Order is kept, oldest first. */
export function selectVisible(
  items: readonly NotifyItem[],
  max: number,
): readonly NotifyItem[] {
  const queued = items.filter((item) => !isRunningTask(item));
  const keep = new Set(queued.slice(-max).map((item) => item.id));

  return items.filter((item) => isRunningTask(item) || keep.has(item.id));
}

/** Distance of the card at `depth` (0 = newest) from the screen edge. `heights` is newest first. */
export function stackOffset(
  depth: number,
  heights: readonly number[],
  expanded: boolean,
  gap: number,
): number {
  if (!expanded) {
    return depth * PEEK_PX;
  }

  let total = 0;

  for (let index = 0; index < depth; index += 1) {
    total += (heights[index] ?? 0) + gap;
  }

  return total;
}

export function stackScale(depth: number, expanded: boolean): number {
  return expanded ? 1 : Math.max(0.8, 1 - depth * SCALE_STEP);
}

/** Height of the whole stack, so the hover area matches what is drawn. */
export function stackHeight(
  heights: readonly number[],
  expanded: boolean,
  gap: number,
): number {
  if (heights.length === 0) {
    return 0;
  }

  if (!expanded) {
    return (heights[0] ?? 0) + (heights.length - 1) * PEEK_PX;
  }

  return heights.reduce((sum, height) => sum + height, 0) + gap * (heights.length - 1);
}
