/**
 * AgentTags: the small labels on an agent (built-in, edited or overridden, project, disabled, archived).
 *
 * Why: an owner scanning the roster needs to know at a glance where each agent comes from and
 *   whether it is in play: a built-in changed from its shipped text reads "edited" on the company
 *   screen and "overridden" on a project's, a switched-off or archived agent reads as set aside.
 *   The labels come from the server's tags so every screen agrees; the wording lives in one
 *   place (domain/agent-copy).
 *
 * Exports: AgentTags.
 * Depends on: domain/agent-copy, schemas/agents.
 */

import { TAG_ORDER, tagInfo } from '#/domain/agent-copy.js';
import type { AgentTag } from '#/schemas/agents.js';

const TONE = {
  plain: 'border-line text-muted',
  attn: 'border-attn bg-attn-soft text-fg',
  quiet: 'border-transparent bg-hover text-faint',
} as const;

export function AgentTags(props: {
  tags: readonly AgentTag[];
  scope: 'company' | 'project';
}) {
  const ordered = TAG_ORDER.filter((tag) => props.tags.includes(tag));

  return (
    <ul aria-label="Tags" className="flex flex-wrap gap-1.5">
      {ordered.map((tag) => {
        const { label, tone } = tagInfo(tag, props.scope);

        return (
          <li
            key={tag}
            className={`whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium ${TONE[tone]}`}
          >
            {label}
          </li>
        );
      })}
    </ul>
  );
}
