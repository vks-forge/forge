/**
 * Pins: the real app providers honour the OS reduced-motion request, not just a hand-made
 * MotionConfig.
 *
 * Why: the previous test proves the switch works; this one proves the app is actually wired to
 *   it. If someone removed `reducedMotion="user"` from AppProviders, every screen would keep
 *   moving for users who asked it not to, and nothing else would notice.
 * Depends on: src/components/app-providers. jsdom.
 */

import { render, screen } from '@testing-library/react';
import { useReducedMotionConfig } from 'motion/react';
import { describe, expect, it } from 'vitest';
import { createHttpAdapter } from '#/api/http/http-adapter.js';
import { createQueryClient } from '#/api/query-client.js';
import { AppProviders } from '#/components/app-providers.js';
import { setMatchMedia } from '#tests/helpers/match-media.js';

function Probe() {
  return <p>{useReducedMotionConfig() ? 'reduced' : 'full'}</p>;
}

describe('AppProviders with reduced motion requested', () => {
  it('reports reduced motion to every animated component', () => {
    setMatchMedia((query) => query.includes('prefers-reduced-motion'));
    const api = createHttpAdapter({ baseUrl: '/api' });

    render(
      <AppProviders api={api} queryClient={createQueryClient()}>
        <Probe />
      </AppProviders>,
    );

    expect(screen.getByText('reduced')).toBeInTheDocument();
  });
});
