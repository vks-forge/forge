/**
 * PageTransition: fades and lifts the next screen in when the route changes.
 *
 * Why: a hard cut between screens makes a tool feel like a set of separate pages; a short
 *   fade with a small rise ties them into one surface and masks the moment content swaps. The
 *   old screen leaves quickly (100 ms) so navigation never feels slower for being animated.
 *   Only opacity and a 8 px translate move. `MotionConfig reducedMotion="user"` in the
 *   providers removes the translate for users who asked for less motion. Keyed by pathname so
 *   switching project replays the transition: the user sees the whole view change. The tabs of
 *   one project's settings share a key (domain/transition-key) so a tab switch keeps the draft.
 *
 * Exports: PageTransition.
 * Depends on: react-router, motion/react, domain/transition-key, theme/motion.
 */

import { AnimatePresence, motion } from 'motion/react';
import { useLocation, useOutlet } from 'react-router';
import { transitionKey } from '#/domain/transition-key.js';
import { routeVariants } from '#/theme/motion.js';

export function PageTransition() {
  const outlet = useOutlet();
  const { pathname } = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={transitionKey(pathname)}
        variants={routeVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="min-w-0"
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}
