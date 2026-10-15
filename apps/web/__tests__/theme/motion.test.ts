/**
 * Pins: every named spring is critically damped (no overshoot), and the route variants move
 * only transform and opacity.
 *
 * Why: the motion floor (d-0103) is "fluid, never janky": springs that overshoot read as
 *   playful wobble in a tool people watch all day, and animating anything but transform and
 *   opacity forces layout and drops frames. A new preset or variant that breaks either rule
 *   fails here before it reaches a screen.
 * Depends on: src/theme/motion. No IO.
 */

import { describe, expect, it } from 'vitest';
import { criticallyDamped, popVariants, routeVariants, springs } from '#/theme/motion.js';

describe('spring presets', () => {
  it('derives damping from stiffness so the spring settles without overshoot', () => {
    const spring = criticallyDamped(400, 1);

    expect(spring).toEqual({ type: 'spring', stiffness: 400, damping: 40, mass: 1 });
    expect(criticallyDamped(100, 4).damping).toBe(40);
  });

  it('keeps every named spring at critical damping', () => {
    for (const spring of Object.values(springs)) {
      const critical = 2 * Math.sqrt(spring.stiffness * spring.mass);

      expect(spring.damping).toBeCloseTo(critical, 1);
    }
  });

  it('orders the springs from quick feedback to weighty surfaces', () => {
    expect(springs.snappy.stiffness).toBeGreaterThan(springs.smooth.stiffness);
    expect(springs.smooth.stiffness).toBeGreaterThan(springs.gentle.stiffness);
    expect(springs.gentle.stiffness).toBeGreaterThan(springs.settle.stiffness);
  });
});

describe('transition variants', () => {
  it('animate only transform and opacity properties', () => {
    const allowed = new Set(['opacity', 'x', 'y', 'scale', 'transition']);

    for (const variants of [routeVariants, popVariants]) {
      for (const state of Object.values(variants)) {
        for (const key of Object.keys(state)) {
          expect(allowed.has(key)).toBe(true);
        }
      }
    }
  });

  it('exits faster than it enters so navigation never feels slow', () => {
    expect(routeVariants.exit.transition.duration).toBeLessThanOrEqual(0.12);
  });
});
