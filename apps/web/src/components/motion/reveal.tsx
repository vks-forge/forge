/**
 * Reveal: content that eases in (and out) with the shared spring.
 *
 * Why: results that appear after a click (a test result, a conflict warning, a saved
 *   message) should arrive with a short, calm motion so the eye finds them, not a hard pop.
 *   Only `opacity` and `transform` move, from the shared presets, and the global
 *   `MotionConfig` drops the movement for users who ask for reduced motion.
 *
 * Exports: Reveal.
 * Depends on: react, motion/react, theme/motion.
 */

import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { springs } from '#/theme/motion.js';

/** Renders `children` when `show` is true, animating in and out. */
export function Reveal(props: {
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {props.show ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0, transition: springs.smooth }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          className={props.className}
        >
          {props.children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
