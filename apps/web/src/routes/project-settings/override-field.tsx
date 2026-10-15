/**
 * OverrideField: one setting that is either inherited or overridden by this project.
 *
 * Why: a project only stores what it changed (d-0085), so every field has two honest states.
 *   Inherited: it shows the value it gets and from where ("Company limit", "Forge default"),
 *   read-only, and will follow later company changes. Overridden: it shows an editor and the
 *   inherited value beside it, so the user sees what they are departing from; switching the
 *   override off puts the inherited value back (the way to clear an override). The switch is
 *   labelled by field, so a screen reader hears "Override Default harness, on".
 *
 * Exports: OverrideField.
 * Depends on: react, components/ui/field.
 */

import type { ReactNode } from 'react';
import { Switch } from '#/components/ui/field.js';

export function OverrideField(props: {
  id: string;
  label: string;
  hint: string;
  overridden: boolean;
  onToggle: (overridden: boolean) => void;
  /** Where the inherited value comes from, in words. */
  source: string;
  /** The inherited value as readable text. */
  inherited: string;
  /** The inherited value shown while the field is not overridden. */
  inheritedView: ReactNode;
  error?: string | undefined;
  disabled?: boolean;
  /** The editor, shown only while overridden. */
  children: ReactNode;
}) {
  const { id, overridden } = props;

  return (
    <div className="grid gap-2 border-b border-line py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p id={`${id}-title`} className="text-sm font-medium">
            {props.label}
          </p>
          <p className="text-xs text-muted">{props.hint}</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs text-muted">
          <Switch
            checked={overridden}
            disabled={props.disabled ?? false}
            label={`Override ${props.label}`}
            onChange={props.onToggle}
          />
          <span aria-hidden="true">{overridden ? 'Overridden' : 'Inherited'}</span>
        </label>
      </div>

      {overridden ? (
        <>
          {props.children}
          <p className="text-xs text-muted">
            {props.source}: <span className="font-data">{props.inherited}</span>. Switch
            the override off to use it again.
          </p>
        </>
      ) : (
        <div className="grid gap-1">
          <div className="min-h-9 rounded-lg bg-hover px-3 py-2 text-sm">
            {props.inheritedView}
          </div>
          <p className="text-xs text-muted">{props.source}. Follows later changes.</p>
        </div>
      )}

      {props.error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}
