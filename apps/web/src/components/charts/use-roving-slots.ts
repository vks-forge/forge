/**
 * useRovingSlots: one keyboard stop for a chart whose bars each carry a tooltip.
 *
 * Why: a 30-day chart with a tab stop per bar would bury the rest of the page for keyboard
 *   users, yet its tooltips (the exact value of each day) must be reachable without a mouse.
 *   The chart is one Tab stop; Left/Right/Home/End move between bars and each focused bar
 *   shows its tooltip, the same one a pointer gets.
 *
 * Exports: useRovingSlots().
 * Depends on: react, types/chart.types.
 */

import { useEffect, useState } from 'react';
import type { RovingSlots } from '#/types/chart.types.js';

const SLOT_SELECTOR = '[data-slot]';

export function useRovingSlots(count: number): RovingSlots {
  // A callback ref held in state, and a native listener attached in an effect: the lint rule
  // forbids handing ref-reading handlers through render.
  const [root, setRoot] = useState<SVGSVGElement | null>(null);
  const [active, setActive] = useState(0);
  const current = Math.min(active, Math.max(0, count - 1));

  useEffect(() => {
    if (!root) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const jump: Record<string, number> = {
        ArrowLeft: current - 1,
        ArrowRight: current + 1,
        Home: 0,
        End: count - 1,
      };

      const target = jump[event.key];

      if (target === undefined) {
        return;
      }

      event.preventDefault();

      const next = Math.min(count - 1, Math.max(0, target));

      setActive(next);
      root.querySelectorAll<SVGElement>(SLOT_SELECTOR)[next]?.focus();
    };

    root.addEventListener('keydown', onKeyDown);

    return () => root.removeEventListener('keydown', onKeyDown);
  }, [root, count, current]);

  return { attach: setRoot, active: current, setActive };
}
