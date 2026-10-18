/**
 * Pins: a Director pipeline suggestion in the Inbox is labelled "Pipeline change" and leads to the
 * project's Pipelines tab, never to a ticket page it has none of, and a proposal that carries a
 * ticket id by mistake still leads there.
 *
 * Why: a project suggestion belongs to no ticket. A link built from a missing ticket id would be dead,
 * and a label that fell back to the raw kind would show the owner a code instead of what it is.
 * Depends on: domain/inbox-links.
 */

import { describe, expect, it } from 'vitest';
import { INBOX_KIND_LABEL, inboxLink } from '#/domain/inbox-links.js';

describe('pipeline_proposal inbox items', () => {
  it('has the owner’s label', () => {
    expect(INBOX_KIND_LABEL.pipeline_proposal).toBe('Pipeline change');
  });

  it('leads to the project Pipelines tab', () => {
    expect(
      inboxLink('sample-service', {
        id: 'pipeline_proposal:12',
        kind: 'pipeline_proposal',
      }),
    ).toEqual({ to: '/p/sample-service/settings/pipelines', label: 'Open Pipelines' });
  });

  it('prefers the Pipelines tab over a ticket link', () => {
    expect(
      inboxLink('sample-service', {
        id: 'pipeline_proposal:12',
        kind: 'pipeline_proposal',
        ticket_id: 'SVC-1',
      }).to,
    ).toBe('/p/sample-service/settings/pipelines');
  });
});
