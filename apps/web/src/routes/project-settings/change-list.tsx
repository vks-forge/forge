/**
 * ChangeList: the readable form of a settings diff.
 *
 * Why: the history rows and the "changed since you opened" banner both show what differs
 *   between two versions. Each changed setting appears on its own line as "name: before to
 *   after", with a word (Added, Changed, Removed) in front so the meaning never rests on
 *   colour, and "inherited" standing for a value the project does not override.
 *
 * Exports: ChangeList.
 * Depends on: domain/doc-diff, types/project-settings.types.
 */

import { describeValue } from '#/domain/doc-diff.js';
import type { DocChange } from '#/types/project-settings.types.js';

const WORD = { added: 'Added', changed: 'Changed', removed: 'Removed' } as const;

export function ChangeList(props: { changes: readonly DocChange[] }) {
  if (props.changes.length === 0) {
    return <p className="text-sm text-muted">No difference in settings.</p>;
  }

  return (
    <ul className="grid gap-2 text-sm">
      {props.changes.map((change) => (
        <li key={change.key} className="grid gap-0.5">
          <span>
            <span className="text-xs font-medium text-muted">{WORD[change.kind]}</span>{' '}
            <span className="font-data">{change.key}</span>
          </span>
          <span className="break-words font-data text-xs text-muted">
            {change.kind === 'added'
              ? describeValue(change.after)
              : `${describeValue(change.before)}  →  ${describeValue(change.after)}`}
          </span>
        </li>
      ))}
    </ul>
  );
}
