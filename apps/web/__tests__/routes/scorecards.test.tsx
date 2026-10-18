/**
 * Pins: scorecards read honestly in the three places they appear. The project's agent roster says
 * how each agent did over 90 days in one line; the agent editor has a Scorecard panel with the
 * slice picker (all / type / tier / lane) and the window (30 / 90 days); a lane's tab lists its
 * pipeline shapes with the Director-changed ones marked. Under five tickets there is no percentage,
 * only "Too few tickets to judge"; a figure with no data says "No data"; cost says how many runs
 * were priced; loading, empty and error each have their own face.
 *
 * Why: the owner decides which agent to trust and which stages are worth their cost from these
 * figures. A rate over three tickets, a cost total that hides half the runs having none, or an
 * error drawn as an empty record would each lead to a wrong decision that looks like a fact.
 * Depends on: components/agents/{agent-row,agent-list,scorecard-panel,scorecard-row-view},
 * components/pipelines/shape-table, api/use-scorecards, the stubbed Forge server.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, networkDown, refusal } from '#tests/helpers/fetch-stub.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';
import { scorecardReply, scorecardRow } from '#tests/helpers/forge-data/proposal-data.js';
import { renderApp } from '#tests/helpers/render-app.js';

const AGENTS = '/p/sample-service/settings/agents';
const PIPELINES = '/p/sample-service/settings/pipelines?lane=standard';
const SCORECARDS = 'GET /projects/:slug/scorecards';

const card = (rows = [scorecardRow()]) =>
  scorecardReply({
    agents: [{ agent_id: 'implementer', name: 'Implementer', role: 'writer', rows }],
  });

describe('Agents roster: the record in one line', () => {
  it('says how the agent did over 90 days', async () => {
    renderApp({ path: AGENTS, routes: { [SCORECARDS]: json(card()) } });

    const row = (await screen.findByText('Implementer', { selector: 'h3' })).closest(
      'li',
    );

    expect(await within(row!).findByText(/Last 90 days:/)).toHaveTextContent(
      'Last 90 days: Done without rework 75% (9 of 12) · Reworks 0.4 per ticket · $0.42 per ticket · 12 tickets',
    );
  });

  it('says there are too few tickets to judge, with no percentage', async () => {
    renderApp({
      path: AGENTS,
      routes: {
        [SCORECARDS]: json(
          card([
            scorecardRow({
              tickets: 3,
              insufficient: true,
              clean_rate: { hits: 3, total: 3, rate: 1 },
            }),
          ]),
        ),
      },
    });

    const row = (await screen.findByText('Implementer', { selector: 'h3' })).closest(
      'li',
    );

    expect(await within(row!).findByText(/Too few tickets to judge/)).toHaveTextContent(
      'Too few tickets to judge (3 so far, 5 needed)',
    );

    expect(within(row!).queryByText(/100%/)).toBeNull();
  });

  it('says an agent with no finished tickets has no record yet', async () => {
    renderApp({ path: AGENTS, routes: { [SCORECARDS]: json(card([])) } });

    const row = (await screen.findByText('Implementer', { selector: 'h3' })).closest(
      'li',
    );

    expect(
      await within(row!).findByText(/No finished tickets in this window yet/),
    ).toBeVisible();
  });

  it('says so when the record cannot be read, and still lists the agents', async () => {
    renderApp({ path: AGENTS, routes: { [SCORECARDS]: networkDown } });

    expect(
      (await screen.findAllByText('Its record could not be loaded.'))[0],
    ).toBeVisible();

    expect(screen.getByText('Implementer', { selector: 'h3' })).toBeVisible();
  });
});

describe('Agent editor: the Scorecard panel', () => {
  async function openPanel(routes: Routes = { [SCORECARDS]: json(card()) }) {
    const user = userEvent.setup();
    const view = renderApp({ path: AGENTS, routes });

    await user.click(await screen.findByRole('button', { name: 'Override Implementer' }));

    return { user, ...view };
  }

  it('shows the headline figure, reworks, cost with how much was priced, and run time', async () => {
    await openPanel();

    const rows = await screen.findByRole('list', { name: 'Scorecard rows' });

    expect(rows).toHaveTextContent('Done without rework');
    expect(rows).toHaveTextContent('75% (9 of 12)');
    expect(rows).toHaveTextContent('0.4 per ticket');
    expect(rows).toHaveTextContent('$0.42 per ticket · Priced for 18 of 20 runs');
    expect(rows).toHaveTextContent('Median 4m 10s, slowest tenth 12m 00s');
  });

  it('says a figure with no data has none, never zero', async () => {
    await openPanel({
      [SCORECARDS]: json(
        card([
          scorecardRow({
            clean_rate: null,
            reworks_per_ticket: null,
            cost: {
              total_usd: 0,
              per_ticket_usd: null,
              coverage: { hits: 0, total: 4, rate: 0 },
            },
            duration: { count: 0, median_ms: null, p90_ms: null },
          }),
        ]),
      ),
    });

    const rows = await screen.findByRole('list', { name: 'Scorecard rows' });

    expect(rows).toHaveTextContent('No data');
    expect(rows).toHaveTextContent('No cost recorded · Priced for 0 of 4 runs');
    expect(rows).not.toHaveTextContent('$0.00');
  });

  it('reads a check by how often it passed first time, with the verdicts on its findings', async () => {
    await openPanel({
      [SCORECARDS]: json(
        card([
          scorecardRow({
            clean_rate: null,
            pass_rate: { hits: 7, total: 10, rate: 0.7 },
            findings: {
              by_severity: { critical: 0, high: 2, medium: 1, low: 1 },
              real: 2,
              false_alarm: 1,
              acted_on: 1,
              overruled: 0,
              unjudged: 0,
            },
          }),
        ]),
      ),
    });

    const rows = await screen.findByRole('list', { name: 'Scorecard rows' });

    expect(rows).toHaveTextContent('Passed first time');
    expect(rows).toHaveTextContent('70% (7 of 10)');
    expect(rows).toHaveTextContent(
      '4 found: 2 real, 1 false alarm, 1 fixed after rework',
    );
  });

  it('splits by ticket type and refetches for 30 days', async () => {
    const { user, forge } = await openPanel({
      [SCORECARDS]: ({ query }) =>
        json(
          scorecardReply({
            range: query.get('range') === '30d' ? '30d' : '90d',
            agents: [
              {
                agent_id: 'implementer',
                name: 'Implementer',
                role: 'writer',
                rows: [
                  scorecardRow(),
                  scorecardRow({
                    by: 'type',
                    value: 'bug',
                    tickets: 4,
                    insufficient: true,
                  }),
                  scorecardRow({ by: 'type', value: 'feature', tickets: 8 }),
                ],
              },
            ],
          }),
        ),
    });

    await screen.findByRole('list', { name: 'Scorecard rows' });
    await user.click(screen.getByRole('button', { name: 'By ticket type' }));

    const rows = screen.getByRole('list', { name: 'Scorecard rows' });

    expect(within(rows).getByText('Type: bug')).toBeVisible();
    expect(within(rows).getByText('Type: feature')).toBeVisible();
    expect(rows).toHaveTextContent('Too few tickets to judge (4 so far, 5 needed)');

    await user.click(screen.getByRole('button', { name: 'Last 30 days' }));

    await waitFor(() =>
      expect(
        forge.stub
          .callsTo(SCORECARDS)
          .some((c) => c.path.includes('range=30d&agent=implementer')),
      ).toBe(true),
    );
  });

  it('says there is nothing to split yet when a slice has no rows', async () => {
    const { user } = await openPanel();

    await screen.findByRole('list', { name: 'Scorecard rows' });
    await user.click(screen.getByRole('button', { name: 'By lane' }));

    expect(await screen.findByText('Nothing to split yet')).toBeVisible();
  });

  it('says the record cannot be loaded, with a retry', async () => {
    await openPanel({
      [SCORECARDS]: refusal(404, 'agent_not_found', 'No such agent.') as never,
    });

    expect(await screen.findByText('Could not load the scorecard')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });
});

describe('Pipelines tab: the lane record', () => {
  const shape = (over: Record<string, unknown> = {}) => ({
    hash: 'a'.repeat(64),
    lane: 'standard' as const,
    label: 'Standard',
    stages: ['implement'],
    director_changed: false,
    rows: [scorecardRow()],
    ...over,
  });

  it('lists the shapes of the lane and marks the ones the Director changed', async () => {
    renderApp({
      path: PIPELINES,
      routes: {
        [SCORECARDS]: json(
          scorecardReply({
            shapes: [
              shape(),
              shape({
                hash: 'c'.repeat(64),
                label: 'Standard + security-reviewer',
                director_changed: true,
                rows: [scorecardRow({ tickets: 2, insufficient: true })],
              }),
              shape({ hash: 'd'.repeat(64), lane: 'full', label: 'Full' }),
            ],
          }),
        ),
      },
    });

    const section = await screen.findByRole('region', { name: 'How this lane has done' });
    const shapes = await within(section).findByRole('list', { name: 'Pipeline shapes' });

    expect(within(shapes).getAllByRole('listitem')).toHaveLength(2);
    expect(within(shapes).getByText('Standard + security-reviewer')).toBeVisible();
    expect(within(shapes).getByText('Changed by the Director')).toBeVisible();
    expect(shapes).toHaveTextContent('Too few tickets to judge (2 so far, 5 needed)');
  });

  it('says nothing has finished on the lane yet', async () => {
    renderApp({ path: PIPELINES });

    const section = await screen.findByRole('region', { name: 'How this lane has done' });

    expect(
      await within(section).findByText('No ticket has finished on this lane yet'),
    ).toBeVisible();
  });

  it('says the record cannot be loaded', async () => {
    renderApp({ path: PIPELINES, routes: { [SCORECARDS]: networkDown } });

    const section = await screen.findByRole('region', { name: 'How this lane has done' });

    expect(await within(section).findByText('Could not load the record')).toBeVisible();
  });
});
