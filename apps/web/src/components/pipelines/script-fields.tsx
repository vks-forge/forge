/**
 * ScriptFields: the command a script gate runs, where, for how long, and which files it guards.
 *
 * Why: a script gate lets the owner add their own check (a linter, a migration dry run) after the
 *   writers. Because the writer could otherwise edit the very script that judges it, a diff that
 *   touches the script (or any guarded path) fails the gate closed, and the first file named in
 *   the command is guarded automatically. The fields say that in the hint where the owner types
 *   the command. Only a one-line command and a folder inside the repository are accepted, which
 *   the problem list explains if they are not. The timeout is typed in seconds, stored in
 *   milliseconds.
 *
 * Exports: ScriptFields.
 * Depends on: react, components/agents/chip-input, components/settings/form-field, @forge/core (types).
 */

import type { ScriptGateStage } from '@forge/core';
import { useLaneId } from '#/components/pipelines/lane-ids.js';
import { ChipInput } from '#/components/agents/chip-input.js';
import { Field } from '#/components/ui/field.js';
import { TextInput } from '#/components/settings/form-field.js';
import type { CustomScript } from '#/types/pipeline-ui.types.js';

export function ScriptFields(props: {
  stage: ScriptGateStage;
  onChange: (next: ScriptGateStage) => void;
}) {
  const { stage } = props;
  const id = useLaneId(`script-${stage.id}`);

  if ('builtin' in stage.run) {
    return null;
  }

  const { run } = stage;
  const set = (change: Partial<CustomScript>): void => {
    const next: CustomScript = { ...run, ...change };

    if (next.cwd === '') {
      delete next.cwd;
    }

    props.onChange({ ...stage, run: next });
  };

  return (
    <div className="grid gap-3">
      <Field
        id={`${id}-command`}
        label="Command"
        hint="One line, run in the ticket's worktree. Exit code 0 passes. A file named first is guarded automatically."
      >
        <TextInput
          id={`${id}-command`}
          value={run.command}
          hasHint
          spellCheck={false}
          autoComplete="off"
          className="font-data"
          onChange={(event) => set({ command: event.target.value })}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id={`${id}-cwd`}
          label="Folder"
          hint="Inside the repository. Empty means the top folder."
        >
          <TextInput
            id={`${id}-cwd`}
            value={run.cwd ?? ''}
            hasHint
            spellCheck={false}
            autoComplete="off"
            className="font-data"
            onChange={(event) => set({ cwd: event.target.value })}
          />
        </Field>
        <Field
          id={`${id}-timeout`}
          label="Time limit (seconds)"
          hint="Between 1 and 1800."
        >
          <TextInput
            id={`${id}-timeout`}
            type="number"
            min={1}
            max={1800}
            value={String(Math.round(run.timeout_ms / 1000))}
            hasHint
            onChange={(event) => {
              const seconds = Number(event.target.value);

              if (Number.isFinite(seconds)) {
                set({ timeout_ms: Math.round(seconds * 1000) });
              }
            }}
          />
        </Field>
      </div>
      <ChipInput
        id={`${id}-guard`}
        label="Guarded paths"
        values={run.guard_paths}
        placeholder="scripts/**"
        hint="A change that touches any of these fails the gate instead of passing it."
        emptyNote="Only the command's own file is guarded."
        onChange={(guard_paths) => set({ guard_paths: [...guard_paths] })}
      />
    </div>
  );
}
