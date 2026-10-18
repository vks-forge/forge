/**
 * Pins: a finished research run is one line in the card's conversation ("Researched: 3
 * searches, 2 pages, 3 facts (1 unverified)") that leads to the Evidence tab; a run that could
 * not look anything up says "Research could not run" with the reason and a way to the setting;
 * and the Plan tab lists the outside facts the plan rests on with their status, evidence links
 * and, when one is unverified, the plain reason approval is the owner's.
 *
 * Why: research is the one step that reaches the open web. If its outcome were silent, an owner
 *   would approve a plan without knowing it rests on unchecked claims, or wonder why no source
 *   appears when the provider was simply off. The wording is the contract: it says how much
 *   was found, how much could not be checked, and what to do.
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/flow-fixtures,
 *   helpers/research-fixtures, components/card/research-line, routes/card/plan/*.
 */

import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { flowRoutes, FLOW_CARD, planFixture } from '#tests/helpers/flow-fixtures.js';
import { renderApp } from '#tests/helpers/render-app.js';
import { researchEvent, researchRoutes } from '#tests/helpers/research-fixtures.js';

const PAGE = `/p/sample-service/cards/${FLOW_CARD}`;
const when = new Date().toISOString();

describe('Conversation: the research line', () => {
  it('says what the run did and links to the evidence', async () => {
    renderApp({
      path: PAGE,
      routes: { ...flowRoutes({ events: [researchEvent(0)] }), ...researchRoutes() },
    });

    const log = await screen.findByRole('log', { name: 'Conversation' });

    expect(
      await within(log).findByText(
        'Researched: 3 searches, 2 pages, 3 facts (1 unverified)',
      ),
    ).toBeVisible();

    expect(within(log).getByRole('link', { name: 'See the evidence' })).toHaveAttribute(
      'href',
      `${PAGE}/evidence`,
    );

    expect(
      within(log).queryByRole('link', { name: 'Open Research settings' }),
    ).toBeNull();
  });

  it('leaves out the unverified count when every fact was checked', async () => {
    renderApp({
      path: PAGE,
      routes: {
        ...flowRoutes({
          events: [
            researchEvent(0, {
              searches: ['one query'],
              fetched: [{ ref: 'S1', url: 'https://docs.example.com/' }],
              claims: [{ ref: 'E1', status: 'verified' }],
            }),
          ],
        }),
        ...researchRoutes(),
      },
    });

    expect(await screen.findByText('Researched: 1 search, 1 page, 1 fact')).toBeVisible();
  });

  it('says research could not run, gives the reason and offers the setting', async () => {
    const note =
      'Research is off, so nothing was looked up. Turn it on in Forge settings, Research.';

    renderApp({
      path: PAGE,
      routes: {
        ...flowRoutes({
          events: [
            researchEvent(0, {
              searches: [],
              fetched: [],
              claims: [],
              unanswered: ['What rate limit applies?'],
              note,
            }),
          ],
        }),
        ...researchRoutes({ evidence: [], sources: [], runs_used: 1 }),
      },
    });

    const log = await screen.findByRole('log', { name: 'Conversation' });

    expect(await within(log).findByText('Research could not run')).toBeVisible();
    expect(within(log).getByText(note)).toBeVisible();
    expect(
      within(log).getByRole('link', { name: 'Open Research settings' }),
    ).toHaveAttribute('href', '/settings/research');

    expect(within(log).getByText('What rate limit applies?')).toBeVisible();
  });

  it('draws a limit note without sending the owner to settings', async () => {
    renderApp({
      path: PAGE,
      routes: {
        ...flowRoutes({
          events: [
            researchEvent(0, {
              searches: [],
              fetched: [],
              claims: [],
              note: 'The research limit for this card (4 runs) is reached, so the plan goes on without more.',
            }),
          ],
        }),
        ...researchRoutes(),
      },
    });

    const log = await screen.findByRole('log', { name: 'Conversation' });

    expect(await within(log).findByText('Research could not run')).toBeVisible();
    expect(
      within(log).queryByRole('link', { name: 'Open Research settings' }),
    ).toBeNull();
  });

  it('still draws a line for a payload it cannot read', async () => {
    renderApp({
      path: PAGE,
      routes: {
        ...flowRoutes({
          events: [researchEvent(0, { searches: 'not a list', claims: 7 })],
        }),
        ...researchRoutes(),
      },
    });

    expect(await screen.findByText('Research ran.')).toBeVisible();
  });
});

describe('Plan tab: outside facts the plan rests on', () => {
  const verification = (claims: unknown[]) => ({
    ...(planFixture()['verification'] as Record<string, unknown>),
    outside_claims: claims,
  });

  const withClaims = (claims: unknown[], floor?: unknown) =>
    flowRoutes({
      detail: { phase: 'plan_ready', column: 'needs_you', needs_you: true },
      plan: {
        versions: [{ version: 1, created_at: when }],
        current: planFixture({ verification: verification(claims) }),
        ...(floor === undefined ? {} : { floor }),
      },
    });

  it('shows each claim with its status and links its evidence to the Evidence tab', async () => {
    renderApp({
      path: `${PAGE}/plan`,
      routes: {
        ...withClaims([
          {
            claim: 'The API allows 100 requests per minute.',
            evidence: ['E1'],
            status: 'supported',
          },
          {
            claim: 'Bursts above 500 are rejected.',
            evidence: ['E2'],
            status: 'unverified',
          },
        ]),
        ...researchRoutes(),
      },
    });

    const list = await screen.findByRole('list', { name: 'Outside facts' });
    const items = within(list).getAllByRole('listitem');

    expect(within(items[0]!).getByText('Supported')).toBeVisible();
    expect(within(items[1]!).getByText('Unverified')).toBeVisible();
    expect(within(items[0]!).getByRole('link', { name: 'E1' })).toHaveAttribute(
      'href',
      `${PAGE}/evidence#evidence-E1`,
    );
  });

  it('says in words why approval is the owner when a claim is unverified', async () => {
    renderApp({
      path: `${PAGE}/plan`,
      routes: {
        ...withClaims(
          [
            {
              claim: 'Bursts above 500 are rejected.',
              evidence: [],
              status: 'unverified',
            },
          ],
          {
            pass: false,
            reasons: [
              'Plan rests on an unverified outside claim: Bursts above 500 are rejected.',
            ],
          },
        ),
        ...researchRoutes(),
      },
    });

    const banners = await screen.findAllByText(
      'Needs your approval: rests on 1 unverified outside fact',
    );

    // Once beside the claims and once with the floor result that carries the server's reason.
    expect(banners).toHaveLength(2);
    expect(screen.getByText(/Plan rests on an unverified outside claim/)).toBeVisible();
    expect(screen.getByText('No evidence is cited for this claim.')).toBeVisible();
  });

  it('shows no banner when every claim is supported', async () => {
    renderApp({
      path: `${PAGE}/plan`,
      routes: {
        ...withClaims([{ claim: 'Checked.', evidence: ['E1'], status: 'supported' }]),
        ...researchRoutes(),
      },
    });

    await screen.findByRole('list', { name: 'Outside facts' });

    expect(screen.queryByText(/Needs your approval: rests on/)).toBeNull();
  });

  it('says None when the plan rests on no outside fact', async () => {
    renderApp({
      path: `${PAGE}/plan`,
      routes: { ...withClaims([]), ...researchRoutes() },
    });

    const section = (await screen.findByText('Outside facts the plan rests on'))
      .parentElement;

    expect(within(section as HTMLElement).getByText('None.')).toBeVisible();
  });
});
