/**
 * Spring presets and route-transition variants: the motion language of the control room.
 *
 * Why: the whole UI is meant to feel fluid and never janky (d-0103). That only holds if every
 *   component moves with the same physics and only animates `transform` and `opacity`, the two
 *   properties the browser can run on the compositor without re-laying-out the page. Every
 *   spring here is critically damped (damping = 2 * sqrt(stiffness * mass)): it reaches its
 *   target as fast as it can without overshoot or wobble, which reads as calm rather than
 *   playful for a tool people watch all day. Components pick a name, never a number.
 *
 * Exports: springs, criticallyDamped(), routeVariants, popVariants.
 * Depends on: types/motion.types. No IO.
 */

import type { SpringName, SpringPreset } from '#/types/motion.types.js';

/** A spring that settles without overshoot: damping is twice the square root of stiffness times mass. */
export function criticallyDamped(stiffness: number, mass = 1): SpringPreset {
  return {
    type: 'spring',
    stiffness,
    damping: Math.round(2 * Math.sqrt(stiffness * mass) * 100) / 100,
    mass,
  };
}

/**
 * snappy: small, direct feedback (active indicator, chevrons); smooth: panels and menus;
 * gentle: page content; settle: large surfaces (drawer, dialog) that should feel weighty.
 */
export const springs: Readonly<Record<SpringName, SpringPreset>> = {
  snappy: criticallyDamped(520),
  smooth: criticallyDamped(340),
  gentle: criticallyDamped(210),
  settle: criticallyDamped(140),
};

/** Page enter and exit. A short exit keeps navigation from feeling slow; y is dropped for reduced motion by MotionConfig. */
export const routeVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: springs.gentle },
  exit: { opacity: 0, transition: { duration: 0.1 } },
} as const;

/** Menus and dialogs: grow from slightly smaller with a fade. */
export const popVariants = {
  initial: { opacity: 0, scale: 0.97, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0, transition: springs.smooth },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.08 } },
} as const;
