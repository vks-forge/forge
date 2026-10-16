/**
 * ChecksEditor: the commands the gates run, one row per check, tagged by role.
 *
 * Why: Forge works on repos in any language because the project says what "tests pass" means
 *   (d-0095). Gates and Workers look at the role (test, lint, typecheck, build, format,
 *   custom), never the name, so the role is a dropdown of exactly the roles core accepts, and
 *   the command is a shell line run as written in the repository (or in an optional
 *   sub-folder). Order matters, since checks run top to bottom, so rows can be moved. Every
 *   control has a label that names its row, for keyboard and screen-reader users.
 *
 * Exports: ChecksEditor.
 * Depends on: react, lucide-react, @forge/core (CheckRole), components/ui/{button,field,picker}.
 */

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { CheckRole } from '@forge/core';
import type { ProjectCheck } from '@forge/core';
import { Button } from '#/components/ui/button.js';
import { INPUT_CLASS } from '#/components/ui/field.js';
import { Picker } from '#/components/ui/picker.js';

const ROLE_ITEMS = CheckRole.options.map((role) => ({ value: role, label: role }));

const ICON_BUTTON =
  'grid size-9 place-items-center rounded-lg text-muted transition-[background-color,transform] duration-150 hover:bg-hover active:translate-y-px disabled:opacity-40';

export function ChecksEditor(props: {
  checks: readonly ProjectCheck[];
  onChange: (next: readonly ProjectCheck[]) => void;
}) {
  const { checks } = props;
  const patch = (index: number, change: Partial<ProjectCheck>): void =>
    props.onChange(checks.map((c, i) => (i === index ? { ...c, ...change } : c)));

  const move = (index: number, by: -1 | 1): void => {
    const next = [...checks];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item as ProjectCheck);
    props.onChange(next);
  };

  return (
    <div className="grid gap-3">
      {checks.length === 0 ? (
        <p className="text-sm text-muted">
          No checks. Gates that need a role you have not set will skip it.
        </p>
      ) : null}
      {checks.map((check, index) => {
        const n = index + 1;

        return (
          <fieldset
            key={index}
            className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[minmax(0,1fr)_9rem]"
          >
            <legend className="px-1 text-xs text-muted">Check {n}</legend>
            <input
              aria-label={`Check ${n} name`}
              placeholder="Name, e.g. unit tests"
              value={check.name}
              onChange={(event) => patch(index, { name: event.target.value })}
              className={INPUT_CLASS}
            />
            <Picker
              label={`Check ${n} role`}
              items={ROLE_ITEMS}
              value={check.role}
              onChange={(role) => patch(index, { role: role as ProjectCheck['role'] })}
            />
            <input
              aria-label={`Check ${n} command`}
              placeholder="Command, e.g. pnpm test"
              value={check.command}
              onChange={(event) => patch(index, { command: event.target.value })}
              className={`${INPUT_CLASS} font-data sm:col-span-2`}
            />
            <input
              aria-label={`Check ${n} folder`}
              placeholder="Folder inside the repo (optional)"
              value={check.cwd ?? ''}
              onChange={(event) => patch(index, { cwd: event.target.value })}
              className={`${INPUT_CLASS} font-data sm:col-span-2`}
            />
            <div className="flex justify-end gap-1 sm:col-span-2">
              <button
                type="button"
                aria-label={`Move check ${n} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className={ICON_BUTTON}
              >
                <ArrowUp aria-hidden="true" className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Move check ${n} down`}
                disabled={index === checks.length - 1}
                onClick={() => move(index, 1)}
                className={ICON_BUTTON}
              >
                <ArrowDown aria-hidden="true" className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Remove check ${n}`}
                onClick={() => props.onChange(checks.filter((_c, i) => i !== index))}
                className={`${ICON_BUTTON} hover:text-danger`}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
            </div>
          </fieldset>
        );
      })}
      <div>
        <Button
          variant="quiet"
          onClick={() =>
            props.onChange([...checks, { name: '', role: 'test', command: '' }])
          }
        >
          <Plus aria-hidden="true" className="size-4" />
          Add check
        </Button>
      </div>
    </div>
  );
}
