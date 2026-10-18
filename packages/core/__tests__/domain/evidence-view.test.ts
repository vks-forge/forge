/**
 * Pins the evidence view join.
 *
 * Why: the plan, the Evidence tab and later Director steps must show each claim with the same sources, and a
 *   claim naming a source that is not stored (a model's invented ref that never verified) must show nothing for
 *   it rather than a made-up page.
 *
 * Pins: sources joined by ref in the claim's order, unknown refs dropped, no page text on the view.
 * Depends on: src/domain/evidence-view, vitest.
 */

import { describe, expect, it } from 'vitest';
import { evidenceViews } from '#/domain/evidence-view.js';
import type { Evidence, ResearchSource } from '#/schemas/research.js';

const source = (ref: string, url: string): ResearchSource => ({
  id: 1,
  project: 'sf',
  card_id: 'SF-C1' as never,
  ref,
  origin: 'director',
  url,
  final_url: `${url}/final`,
  title: `T ${ref}`,
  retrieved_at: '2026-10-18T10:00:00.000Z',
  sha256: 'a'.repeat(64),
  bytes: 3,
  truncated: false,
});

const row = (sources: string[]): Evidence => ({
  id: 1,
  card_id: 'SF-C1' as never,
  ref: 'E1',
  step_id: 'research',
  origin: 'research_step',
  claim: 'A claim long enough',
  quotes: [],
  sources,
  status: 'unverified',
  created_at: '2026-10-18T10:00:00.000Z',
});

describe('evidenceViews', () => {
  it('lists the named sources in the claim order and drops refs that are not stored', () => {
    const [view] = evidenceViews(
      [row(['S2', 'S9', 'S1'])],
      [source('S1', 'https://a.example/1'), source('S2', 'https://a.example/2')],
    );

    expect(view?.source_list.map((s) => s.ref)).toEqual(['S2', 'S1']);
    expect(view?.source_list[0]).toEqual({
      ref: 'S2',
      url: 'https://a.example/2',
      final_url: 'https://a.example/2/final',
      title: 'T S2',
      retrieved_at: '2026-10-18T10:00:00.000Z',
    });
  });

  it('ignores sources without a ref (a Worker page) and keeps an empty list for a claim with none', () => {
    const worker = { ...source('S1', 'https://w.example') } as Partial<ResearchSource>;
    delete worker.ref;

    expect(
      evidenceViews([row(['S1'])], [worker as ResearchSource])[0]?.source_list,
    ).toEqual([]);

    expect(evidenceViews([row([])], [])[0]?.source_list).toEqual([]);
  });
});
