/**
 * Scripted run streams for the mock adapter, by run id.
 *
 * Why: the live thread has to be seen working: messages, tool calls with results, permission
 *   decisions and denials, a question, a failure. A run whose script ends with `finish` or
 *   `error` closes its stream; one that does not stays open like a Worker still working.
 *   Events are parsed with core's `RunEvent`, so a script cannot drift from the real shape.
 *
 * Exports: streamScripts().
 * Depends on: @forge/core (RunEvent), api/mock/ticket-seeds.
 */

import { RunEvent } from '@forge/core';
import { ago } from '#tests/helpers/fake-tickets/seeds.js';

function script(events: readonly Record<string, unknown>[]): RunEvent[] {
  return events.map((event, index) =>
    RunEvent.parse({ ...event, seq: index + 1, ts: ago(30 - index) }),
  );
}

/** The events each sample run streams, by run id. A run without a `finish` or `error` stays open. */
export function streamScripts(): Readonly<Record<string, readonly RunEvent[]>> {
  const common = (id: string): Record<string, unknown>[] => [
    { type: 'text', text: `Reading the request for ${id} and the files it touches.` },
    {
      type: 'tool_call',
      call_id: 'c1',
      name: 'Read',
      input: { path: 'src/report/window.ts' },
    },
    {
      type: 'tool_result',
      call_id: 'c1',
      output: 'export function windowFor(day) { /* ... */ }',
      is_error: false,
    },
  ];

  return {
    'run-svc-1': script([
      ...common('SVC-1'),
      { type: 'permission', call_id: 'c2', tool: 'Bash', decision: 'allow' },
      { type: 'tool_call', call_id: 'c2', name: 'Bash', input: { command: 'pnpm test' } },
      { type: 'tool_result', call_id: 'c2', output: '12 passed', is_error: false },
      {
        type: 'finish',
        summary: 'Sends now retry three times with exponential backoff.',
      },
    ]),
    'run-svc-3': script([
      ...common('SVC-3'),
      {
        type: 'text',
        text: 'The exporter builds the whole CSV in memory. I will switch it to a stream.',
      },
      { type: 'permission', call_id: 'c2', tool: 'Bash', decision: 'allow' },
      {
        type: 'tool_call',
        call_id: 'c2',
        name: 'Bash',
        input: { command: 'pnpm test export' },
      },
      {
        type: 'tool_result',
        call_id: 'c2',
        output: '2 failed: expected stream, got Buffer',
        is_error: true,
      },
      { type: 'permission', call_id: 'c3', tool: 'Bash', decision: 'deny' },
      {
        type: 'text',
        text: 'Tests fail as expected before the change. Editing the exporter now.',
      },
      {
        type: 'tool_call',
        call_id: 'c4',
        name: 'Edit',
        input: { path: 'src/export/csv.ts' },
      },
    ]),
    'run-svc-4': script([
      ...common('SVC-4'),
      {
        type: 'text',
        text: 'The window is computed in UTC but the report is read in local time.',
      },
      {
        type: 'ask',
        interaction_id: 'int-svc-4',
        kind: 'question',
        prompt: 'Should the report window use UTC or the account time zone?',
      },
    ]),
    'run-svc-8': script([
      ...common('SVC-8'),
      {
        type: 'error',
        family: 'crash',
        message: 'The Worker process exited unexpectedly.',
      },
    ]),
    'run-web-1': script([...common('WEB-1')]),
  };
}
