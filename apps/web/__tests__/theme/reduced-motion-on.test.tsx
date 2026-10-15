/**
 * Pins: when the OS asks for reduced motion, the app's motion config reports it, so every
 * spring and route transition drops its movement; and the stylesheet carries the CSS fallback.
 *
 * Why: motion is a headline feature (d-0103) but vestibular disorders make large movement
 *   harmful, so honouring `prefers-reduced-motion` is an accessibility floor, not polish. The
 *   preference is read once per page by the motion library, so this case has its own file.
 * Depends on: src/theme/app.css (read as text). jsdom.
 */

import { render, screen } from '@testing-library/react';
import { MotionConfig, useReducedMotionConfig } from 'motion/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { setMatchMedia } from '#tests/helpers/match-media.js';

function Probe() {
  return <p>{useReducedMotionConfig() ? 'reduced' : 'full'}</p>;
}

describe('reduced motion requested', () => {
  it('is reported through MotionConfig reducedMotion="user"', () => {
    setMatchMedia((query) => query.includes('prefers-reduced-motion'));

    render(
      <MotionConfig reducedMotion="user">
        <Probe />
      </MotionConfig>,
    );

    expect(screen.getByText('reduced')).toBeInTheDocument();
  });

  it('is backed by a CSS rule that stops transitions and animations', () => {
    const css = readFileSync(
      resolve(import.meta.dirname, '../../src/theme/app.css'),
      'utf8',
    );

    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/transition-duration: 0\.01ms/);
  });
});
