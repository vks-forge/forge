/**
 * Shapes of the motion presets.
 *
 * Why: springs are described once in theme/motion.ts and consumed by every animated
 *   component; a shared type keeps a component from inventing an ad-hoc transition object.
 *
 * Exports: SpringPreset, SpringName.
 * Depends on: nothing. Types only.
 */

/** A `motion` spring transition with the three physical parameters spelled out. */
export interface SpringPreset {
  readonly type: 'spring';
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: number;
}

/** The named springs the app uses; add a name only when no existing one fits. */
export type SpringName = 'snappy' | 'smooth' | 'gentle' | 'settle';
