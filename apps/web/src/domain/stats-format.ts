/**
 * Number and date wording for Home, Runs and Cost.
 *
 * Why: the same figures appear in a readout line, a tile, a chart label and a table, and must
 *   read identically everywhere. Money is shown only as far as runs reported it, so a value
 *   below a cent says so instead of rounding to `$0.00` (which would read as "free"). A
 *   missing value is a dash or "No data", never a zero: the server uses null for "nothing to
 *   compute" and the UI must not turn that into a flattering or alarming 0 (d-0104).
 *
 * Exports: RANGES, formatUsd(), formatDuration(), formatPercent(), formatCount(),
 *   formatTokens(), shortDay(), rangeLabel().
 * Depends on: @forge/core (StatsRange type). Pure.
 */

import type { StatsRange } from '@forge/core';

export const RANGES: readonly StatsRange[] = ['7d', '30d', '90d'];

const RANGE_WORDS: Readonly<Record<StatsRange, string>> = {
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  '90d': 'last 90 days',
};

export const rangeLabel = (range: StatsRange): string => RANGE_WORDS[range];

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const COUNT = new Intl.NumberFormat('en-US');

/** `$1.23`; a positive amount under a cent is `<$0.01`; null is a dash. */
export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }

  return value > 0 && value < 0.01 ? '<$0.01' : USD.format(value);
}

/** `45s`, `12m 05s`, `3h 20m`, `2d 4h`; null is a dash. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) {
    return '—';
  }

  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
  }

  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/** `0.375` becomes `38%`. */
export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export const formatCount = (value: number): string => COUNT.format(value);

/** `950`, `12.3k`, `4.1M`. */
export function formatTokens(value: number): string {
  if (value < 1000) {
    return String(Math.round(value));
  }

  if (value < 1_000_000) {
    return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  }

  return `${(value / 1_000_000).toFixed(1)}M`;
}

const DAY = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** `2026-10-04` as `Oct 4` (the server's days are UTC calendar days). */
export function shortDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);

  return Number.isNaN(parsed.getTime()) ? date : DAY.format(parsed);
}
