/**
 * Pins: the daily BarChart shows each day's value in the app's own Tooltip on hover or
 * keyboard focus, never in a native `title` bubble, and its bars are one arrow-key stop.
 *
 * Why: the browser's title bubble is slow, unstyled and invisible to keyboard users, so the
 *   Cost page's "Spend per day" must use the shared Tooltip. A tab stop per day would trap
 *   keyboard users in a 30-bar chart, so the bars share one stop and arrow keys move on.
 * Depends on: src/components/charts/bar-chart, src/components/charts/bucket-chart. jsdom.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BarChart } from '#/components/charts/bar-chart.js';
import { BucketChart } from '#/components/charts/bucket-chart.js';

const POINTS = [
  { date: '2026-10-14', value: 1.5 },
  { date: '2026-10-15', value: null },
  { date: '2026-10-16', value: 3 },
];

function renderBars() {
  return render(
    <BarChart
      title="Spend per day (USD)"
      points={POINTS}
      format={(value) => `$${value.toFixed(2)}`}
      noData="No spend"
    />,
  );
}

describe('BarChart tooltips', () => {
  it('has no native SVG title elements', () => {
    const { container } = renderBars();

    expect(container.querySelectorAll('svg title')).toHaveLength(0);
  });

  it('shows the day and value in the shared Tooltip on keyboard focus', async () => {
    const user = userEvent.setup();

    renderBars();
    await user.tab();

    expect(await screen.findByRole('tooltip')).toHaveTextContent('$1.50');
  });

  it('moves between days with the arrow keys and tells a missing day apart', async () => {
    const user = userEvent.setup();

    renderBars();
    await user.tab();
    await user.keyboard('{ArrowRight}');

    expect(await screen.findByRole('tooltip')).toHaveTextContent('no data');
  });

  it('names the chart as a group and each day as an image, not the svg as one image', () => {
    const { container } = renderBars();
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('role', 'group');
    expect(svg).toHaveAttribute('aria-roledescription', 'chart');
    expect(container.querySelectorAll('rect[data-slot][role="img"]')).toHaveLength(3);
  });

  it('keeps one tab stop for all bars', () => {
    const { container } = renderBars();
    const stops = container.querySelectorAll('rect[data-slot][tabindex="0"]');

    expect(stops).toHaveLength(1);
  });
});

describe('BucketChart roles', () => {
  it('is a group whose hit areas are images', () => {
    const { container } = render(
      <BucketChart
        title="Spend over time"
        buckets={['2026-10-15', '2026-10-16']}
        group="day"
        mode="stacked"
        format={(value) => `$${value}`}
        noData="Nothing"
        series={[{ key: 'a', label: 'Alpha', color: 'red', values: [1, 2] }]}
      />,
    );

    expect(container.querySelector('svg')).toHaveAttribute('role', 'group');
    expect(container.querySelectorAll('rect[data-slot][role="img"]')).toHaveLength(2);
  });
});

describe('BucketChart tooltips', () => {
  it('lists every series in the tooltip of a focused bucket', async () => {
    const user = userEvent.setup();

    render(
      <BucketChart
        title="Spend over time"
        buckets={['2026-10-15', '2026-10-16']}
        group="day"
        mode="stacked"
        format={(value) => `$${value}`}
        noData="Nothing"
        series={[
          { key: 'a', label: 'Alpha', color: 'red', values: [1, 2] },
          { key: 'b', label: 'Beta', color: 'blue', values: [3, 0] },
        ]}
      />,
    );

    await user.tab();

    const tip = await screen.findByRole('tooltip');

    expect(tip).toHaveTextContent('Alpha');
    expect(tip).toHaveTextContent('Beta');
    expect(tip).toHaveTextContent('Total');
  });
});

describe('BarChart split into two series', () => {
  const PARTS = [
    { key: 'workers', label: 'Workers', color: 'var(--series-1)' },
    { key: 'director', label: 'Director', color: 'var(--series-2)' },
  ];

  const SPLIT = [
    { date: '2026-10-14', value: 10, parts: [3, 7] },
    { date: '2026-10-15', value: 0, parts: [0, 0] },
  ];

  it('stacks both series, keys them in words and gives each part in the tooltip and the table', async () => {
    const user = userEvent.setup();

    const { container } = render(
      <BarChart
        title="Spend per day (USD)"
        points={SPLIT}
        parts={PARTS}
        format={(value) => `$${value.toFixed(2)}`}
        noData="No spend"
      />,
    );

    expect(screen.getByRole('list', { name: 'Legend' })).toHaveTextContent(
      /Workers.*Director/,
    );

    // One stacked bar of two rectangles for the day that has spend, plus the quiet tick of the zero day.
    expect(container.querySelectorAll('rect[fill="var(--series-1)"]')).toHaveLength(1);
    expect(container.querySelectorAll('rect[fill="var(--series-2)"]')).toHaveLength(1);

    await user.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      '$10.00 (Workers $3.00 · Director $7.00)',
    );

    expect(screen.getByRole('table')).toHaveTextContent(
      '$10.00 (Workers $3.00 · Director $7.00)',
    );
  });
});
