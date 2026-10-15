/**
 * ActiveIndicator: the highlight that glides between sidebar entries.
 *
 * Why: when the user moves from Board to Memory the highlight should travel, not blink off
 *   and on; the motion tells them where they came from and that the click registered. It is a
 *   `motion` shared-layout element: every entry renders one when active, they share a
 *   `layoutId`, and the library animates the position change using only `transform`, the
 *   cheapest property to animate. Under reduced motion the highlight moves without travelling.
 *
 * Exports: ActiveIndicator.
 * Depends on: motion/react, theme/motion.
 */

import { motion } from 'motion/react';
import { springs } from '#/theme/motion.js';

/** One shared id for the whole sidebar, so project and Forge entries share one highlight. */
const NAV_INDICATOR_ID = 'nav-active-indicator';

export function ActiveIndicator() {
  return (
    <motion.span
      layoutId={NAV_INDICATOR_ID}
      transition={springs.snappy}
      aria-hidden="true"
      className="absolute inset-0 -z-0 rounded-lg bg-hover"
    />
  );
}
