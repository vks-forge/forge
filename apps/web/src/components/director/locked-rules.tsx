/**
 * LockedRules and PlaybooksView: what the Director settings cannot change, and the methods it follows.
 *
 * Why: an owner who can edit the flow and the house rules should also see where editing
 *   stops. The locked rules are listed greyed, each with the reason, so "why can't I turn this
 *   off" has an answer on the same screen (d-0150). Playbooks are the written methods each
 *   step follows; they ship with Forge and are shown read-only so the owner can read exactly
 *   what a step is told.
 *
 * Exports: LockedRules, PlaybooksView.
 * Depends on: lucide-react, domain/director-settings, schemas/director-config (types).
 */

import { BookOpen, Lock } from 'lucide-react';
import { LOCKED_RULES } from '#/domain/director-settings.js';
import type { DirectorConfig } from '#/schemas/director-config.js';
import { EmptyState } from '#/components/ui/empty-state.js';

export function LockedRules() {
  return (
    <ul aria-label="Locked rules" className="grid gap-2">
      {LOCKED_RULES.map((rule) => (
        <li
          key={rule.id}
          className="flex gap-3 rounded-lg border border-line bg-hover px-3 py-2.5 text-muted"
        >
          <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div className="grid gap-0.5 text-sm">
            <p className="font-medium">{rule.title}</p>
            <p className="text-xs">{rule.reason}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PlaybooksView(props: { playbooks: DirectorConfig['playbooks'] }) {
  const entries = Object.entries(props.playbooks);

  if (entries.length === 0) {
    return (
      <EmptyState
        variant="compact"
        icon={BookOpen}
        title="No playbooks are in these settings yet"
      >
        Steps then use only their own instructions.
      </EmptyState>
    );
  }

  return (
    <ul aria-label="Playbooks" className="grid gap-2">
      {entries.map(([id, playbook]) => (
        <li key={id} className="rounded-lg border border-line">
          <details>
            <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-2 px-3 py-2.5 text-sm font-medium">
              {playbook.title}
              <span className="font-data text-xs font-normal text-muted">{id}</span>
            </summary>
            <pre className="max-h-96 scroll-area overflow-auto border-t border-line px-3 py-3 font-data text-xs whitespace-pre-wrap">
              {playbook.body}
            </pre>
          </details>
        </li>
      ))}
    </ul>
  );
}
