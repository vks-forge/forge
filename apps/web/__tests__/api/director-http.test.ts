/**
 * Pins: the http adapter's calls for the Director's pipeline surfaces: the proposals list asks for
 * pending or all, accept sends the project version and a trimmed optional reason, reject sends its
 * trimmed reason, the scorecards query carries the window and (only when asked) the agent, a mark is a
 * PUT on the stage row and finding position with the verdict or null, and an answer that does not
 * match its schema fails at the boundary as a payload error.
 *
 * Why: these calls change a project's lanes and the record the scorecards are built from. A path built
 * wrong, a blank reason sent as an empty string the server would refuse, or a reply accepted without
 * checking its shape would each surface later as a confusing screen instead of a named failure here.
 * Depends on: src/api/http/http-adapter, src/api/api-error, helpers/forge-data/proposal-data. No IO (fetch is a fake).
 */

import { describe, expect, it, vi } from 'vitest';
import type { ApiError } from '#/api/api-error.js';
import { createHttpAdapter } from '#/api/http/http-adapter.js';
import {
  addReviewerProposal,
  scorecardReply,
} from '#tests/helpers/forge-data/proposal-data.js';
import { ticketPipeline } from '#tests/helpers/forge-data/pipeline-data.js';

const answer = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue(Response.json(body, { status }));

const apiFor = (fetch: typeof globalThis.fetch) =>
  createHttpAdapter({ baseUrl: '/api', fetch });

const sent = (fetch: ReturnType<typeof vi.fn>) => {
  const [url, init] = fetch.mock.calls[0] as [string, RequestInit];

  return {
    url,
    method: init.method,
    body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
  };
};

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }

  throw new Error('expected the call to fail');
}

describe('http adapter: proposals', () => {
  it('lists the pending ones of a project', async () => {
    const fetch = answer({ proposals: [addReviewerProposal()] });

    const list = await apiFor(fetch).proposals.list('sample-service', 'pending');

    expect(list.map((p) => p.id)).toEqual([12]);
    expect(sent(fetch)).toMatchObject({
      url: '/api/settings/projects/sample-service/pipeline-proposals?status=pending',
      method: 'GET',
    });
  });

  it('asks for all of them when told to', async () => {
    const fetch = answer({ proposals: [] });

    await apiFor(fetch).proposals.list('sample-service', 'all');

    expect(sent(fetch).url).toContain('?status=all');
  });

  // The request is what these three pin; the reply shape of accept is covered by the Pipelines route
  // tests, so the stub answers something the schema refuses and the call is allowed to fail.
  it('sends the project version and a trimmed reason on accept', async () => {
    const fetch = answer({});

    await failureOf(
      apiFor(fetch).proposals.accept('sample-service', 12, {
        expected_version: 5,
        reason: '  Fine by me  ',
      }),
    );

    expect(sent(fetch)).toMatchObject({
      url: '/api/settings/projects/sample-service/pipeline-proposals/12/accept',
      method: 'POST',
      body: { expected_version: 5, reason: 'Fine by me' },
    });
  });

  it('sends no reason at all when the note is blank', async () => {
    const fetch = answer({});

    await failureOf(
      apiFor(fetch).proposals.accept('sample-service', 12, {
        expected_version: 5,
        reason: '   ',
      }),
    );

    expect(sent(fetch).body).toEqual({ expected_version: 5 });
  });

  it('sends the trimmed reason on reject', async () => {
    const fetch = answer({});

    await failureOf(
      apiFor(fetch).proposals.reject('sample-service', 12, { reason: ' Not here ' }),
    );

    expect(sent(fetch)).toMatchObject({
      url: '/api/settings/projects/sample-service/pipeline-proposals/12/reject',
      method: 'POST',
      body: { reason: 'Not here' },
    });
  });

  it('fails at the boundary, naming a reply that does not match', async () => {
    const error = await failureOf(
      apiFor(answer({ proposals: [{ id: 'twelve' }] })).proposals.list(
        'sample-service',
        'pending',
      ),
    );

    expect(error.kind).toBe('payload');
  });
});

describe('http adapter: scorecards', () => {
  it('asks for a window', async () => {
    const fetch = answer(scorecardReply());

    const reply = await apiFor(fetch).scorecards.get({
      slug: 'sample-service',
      range: '30d',
    });

    expect(reply.agents[0]?.agent_id).toBe('implementer');
    expect(sent(fetch).url).toBe('/api/projects/sample-service/scorecards?range=30d');
  });

  it('asks for one agent only when told which', async () => {
    const fetch = answer(scorecardReply());

    await apiFor(fetch).scorecards.get({
      slug: 'sample-service',
      range: '90d',
      agent: 'front end',
    });

    expect(sent(fetch).url).toBe(
      '/api/projects/sample-service/scorecards?range=90d&agent=front%20end',
    );
  });

  it('fails at the boundary on a malformed row', async () => {
    const bad = scorecardReply();

    (bad.agents[0]!.rows[0] as unknown as Record<string, unknown>)['tickets'] = 'many';

    const error = await failureOf(
      apiFor(answer(bad)).scorecards.get({ slug: 'sample-service', range: '90d' }),
    );

    expect(error.kind).toBe('payload');
  });
});

describe('http adapter: finding marks', () => {
  it('puts the verdict on the stage row and the finding position', async () => {
    const fetch = answer({ pipeline: ticketPipeline([]) });

    const view = await apiFor(fetch).pipelines.markFinding('SVC-1', 7, 2, 'false_alarm');

    expect(view.lane).toBe('standard');
    expect(sent(fetch)).toMatchObject({
      url: '/api/tickets/SVC-1/findings/7/2/mark',
      method: 'PUT',
      body: { verdict: 'false_alarm' },
    });
  });

  it('sends null to clear', async () => {
    const fetch = answer({ pipeline: ticketPipeline([]) });

    await apiFor(fetch).pipelines.markFinding('SVC-1', 7, 0, null);

    expect(sent(fetch).body).toEqual({ verdict: null });
  });

  it('keeps the server code of a refusal', async () => {
    const fetch = answer({ error: { code: 'finding_not_found', message: 'gone' } }, 404);

    const error = await failureOf(
      apiFor(fetch).pipelines.markFinding('SVC-1', 7, 0, 'real'),
    );

    expect(error.code).toBe('finding_not_found');
    expect(error.status).toBe(404);
  });
});
