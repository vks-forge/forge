/**
 * Pins: with no reduced-motion preference the app's motion config leaves full motion on, and
 * the real providers wrap the app in `MotionConfig reducedMotion="user"`.
 *
 * Why: the other half of the accessibility contract: users who did not ask for less motion get
 *   the fluid interface the product promises (d-0103). Kept in its own file because the motion
 *   library reads the OS preference once per page.
 * Depends on: src/components/app-providers. jsdom.
 */

import { render, screen } from '@testing-library/react';
import { useReducedMotionConfig } from 'motion/react';
import { describe, expect, it } from 'vitest';
import { composeApi } from '#/api/compose-api.js';
import { createQueryClient } from '#/api/query-client.js';
import { AppProviders } from '#/components/app-providers.js';

function Probe() {
  return <p>{useReducedMotionConfig() ? 'reduced' : 'full'}</p>;
}

describe('no reduced-motion preference', () => {
  it('keeps full motion inside the real app providers', () => {
    const { api, table } = composeApi({ forceApi: 'mock' });

    render(
      <AppProviders api={api} table={table} queryClient={createQueryClient()}>
        <Probe />
      </AppProviders>,
    );

    expect(screen.getByText('full')).toBeInTheDocument();
  });
});
