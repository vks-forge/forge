/**
 * SetupEditor: the steps Forge runs in a fresh copy of the project before a Worker starts.
 *
 * Why: Workers may not install packages, so Forge installs what the project's checks need
 *   itself (d-0180), in whatever way the project's language does it (d-0176). The owner must be
 *   able to read each step as it will run and change it: a name, the command, the folder it runs
 *   in. The rarer knobs live behind "Advanced" so the common case stays three boxes: the files
 *   whose change makes the step run again, folders to put on PATH (a virtual environment's tool
 *   folder), variables to pass from this computer (a registry token; the value is never stored)
 *   and the time limit. Each step also says what it reuses between tickets ("Cache: restores
 *   node_modules", "Downloads shared" or "No cache") and, when it restores folders by copy, has a
 *   switch to turn that off. Order matters, since steps run top to bottom, so rows can be moved. Every
 *   control is labelled with its row for keyboard and screen-reader users.
 *
 * Exports: SetupEditor.
 * Depends on: react, lucide-react, components/ui/{button,field}, domain/setup-draft,
 *   types/project-settings.types.
 */

import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '#/components/ui/button.js';
import { INPUT_CLASS, Switch } from '#/components/ui/field.js';
import { blankSetupRow, cacheLine, MAX_SETUP_STEPS } from '#/domain/setup-draft.js';
import type { SetupRow } from '#/types/project-settings.types.js';

const ICON_BUTTON =
  'grid size-9 place-items-center rounded-lg text-muted transition-[background-color,transform] duration-150 hover:bg-hover active:translate-y-px disabled:opacity-40';

const LINK_BUTTON =
  'inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm text-muted underline-offset-2 hover:text-fg hover:underline';

function Advanced(props: {
  n: number;
  row: SetupRow;
  onPatch: (change: Partial<SetupRow>) => void;
}) {
  const { n, row } = props;
  const id = `setup-${n}`;

  return (
    <div className="grid gap-3 border-t border-line pt-3 sm:col-span-2">
      <div className="grid gap-1">
        <label htmlFor={`${id}-inputs`} className="text-xs font-medium">
          Files that make this step run again
        </label>
        <textarea
          id={`${id}-inputs`}
          rows={2}
          value={row.inputs}
          placeholder="One file per line, e.g. a lockfile"
          onChange={(event) => props.onPatch({ inputs: event.target.value })}
          className={`${INPUT_CLASS} font-data`}
        />
        <p className="text-xs text-muted">
          When none of them changed since the last time, Forge skips the step.
        </p>
      </div>
      <div className="grid gap-1">
        <label htmlFor={`${id}-path`} className="text-xs font-medium">
          Folders to put first on PATH
        </label>
        <textarea
          id={`${id}-path`}
          rows={2}
          value={row.path}
          placeholder="One folder per line, inside the repository"
          onChange={(event) => props.onPatch({ path: event.target.value })}
          className={`${INPUT_CLASS} font-data`}
        />
        <p className="text-xs text-muted">
          For tools this step creates. Later steps, the checks and the Worker find them
          there.
        </p>
      </div>
      <div className="grid gap-1">
        <label htmlFor={`${id}-pass`} className="text-xs font-medium">
          Variables to pass from this computer
        </label>
        <textarea
          id={`${id}-pass`}
          rows={2}
          value={row.pass_env}
          placeholder="One name per line, e.g. REGISTRY_TOKEN"
          onChange={(event) => props.onPatch({ pass_env: event.target.value })}
          className={`${INPUT_CLASS} font-data`}
        />
        <p className="text-xs text-muted">
          Only the names are saved. The values stay on this computer.
        </p>
      </div>
      <div className="grid max-w-40 gap-1">
        <label htmlFor={`${id}-timeout`} className="text-xs font-medium">
          Time limit (minutes)
        </label>
        <input
          id={`${id}-timeout`}
          inputMode="numeric"
          value={row.timeout}
          onChange={(event) => props.onPatch({ timeout: event.target.value })}
          className={`${INPUT_CLASS} font-data`}
        />
      </div>
    </div>
  );
}

/** What the step reuses between tickets, and a switch for the copy cache when it has one. */
function CacheRow(props: {
  n: number;
  row: SetupRow;
  onPatch: (change: Partial<SetupRow>) => void;
}) {
  const { n, row } = props;
  const copies = row.cache_outputs.length > 0;
  const folders = row.cache_outputs.join(', ');

  return (
    <div className="grid gap-1 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">{cacheLine(row, row.copy_cache)}</p>
        {copies ? (
          <label className="flex items-center gap-2 text-xs text-muted">
            <Switch
              checked={row.copy_cache}
              label={`Setup step ${n} copy cache`}
              onChange={(on) => props.onPatch({ copy_cache: on })}
            />
            <span aria-hidden="true">Copy {folders} from an earlier ticket</span>
          </label>
        ) : null}
      </div>
      {copies && !row.copy_cache ? (
        <p className="text-xs text-muted">
          Off: when you save, this step installs from scratch for every ticket. Downloads
          stay shared. “Use detected” brings the copy cache back.
        </p>
      ) : null}
    </div>
  );
}

export function SetupEditor(props: {
  rows: readonly SetupRow[];
  onChange: (next: readonly SetupRow[]) => void;
  disabled?: boolean;
}) {
  const { rows } = props;
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const patch = (index: number, change: Partial<SetupRow>): void =>
    props.onChange(rows.map((r, i) => (i === index ? { ...r, ...change } : r)));

  const move = (index: number, by: -1 | 1): void => {
    const next = [...rows];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item as SetupRow);
    props.onChange(next);
  };

  const toggle = (index: number): void => {
    const next = new Set(open);
    if (!next.delete(index)) {
      next.add(index);
    }

    setOpen(next);
  };

  return (
    <div className="grid gap-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          No steps. Add one if the project needs something installed before its checks can
          run.
        </p>
      ) : null}
      {rows.map((row, index) => {
        const n = index + 1;
        const expanded = open.has(index);

        return (
          <fieldset
            key={index}
            disabled={props.disabled ?? false}
            className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-2"
          >
            <legend className="px-1 text-xs text-muted">Step {n}</legend>
            <input
              aria-label={`Setup step ${n} name`}
              placeholder="Name, e.g. Install packages"
              value={row.name}
              onChange={(event) => patch(index, { name: event.target.value })}
              className={INPUT_CLASS}
            />
            <input
              aria-label={`Setup step ${n} folder`}
              placeholder="Folder inside the repo (optional)"
              value={row.cwd}
              onChange={(event) => patch(index, { cwd: event.target.value })}
              className={`${INPUT_CLASS} font-data`}
            />
            <input
              aria-label={`Setup step ${n} command`}
              placeholder="Command, e.g. uv sync, cargo fetch or bundle install"
              value={row.command}
              onChange={(event) => patch(index, { command: event.target.value })}
              className={`${INPUT_CLASS} font-data sm:col-span-2`}
            />
            <CacheRow n={n} row={row} onPatch={(change) => patch(index, change)} />
            {expanded ? (
              <Advanced n={n} row={row} onPatch={(change) => patch(index, change)} />
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-1 sm:col-span-2">
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={`Advanced options for step ${n}`}
                onClick={() => toggle(index)}
                className={LINK_BUTTON}
              >
                Advanced
                <ChevronDown
                  aria-hidden="true"
                  className={`size-4 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
                />
              </button>
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label={`Move setup step ${n} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className={ICON_BUTTON}
                >
                  <ArrowUp aria-hidden="true" className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Move setup step ${n} down`}
                  disabled={index === rows.length - 1}
                  onClick={() => move(index, 1)}
                  className={ICON_BUTTON}
                >
                  <ArrowDown aria-hidden="true" className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Remove setup step ${n}`}
                  onClick={() => props.onChange(rows.filter((_r, i) => i !== index))}
                  className={`${ICON_BUTTON} hover:text-danger`}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              </div>
            </div>
          </fieldset>
        );
      })}
      <div>
        <Button
          variant="quiet"
          disabled={(props.disabled ?? false) || rows.length >= MAX_SETUP_STEPS}
          onClick={() => props.onChange([...rows, blankSetupRow()])}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add setup step
        </Button>
      </div>
    </div>
  );
}
