/**
 * Cap lists: the per-harness and per-ticket-state caps, and the quota fallback order.
 *
 * Why: three limits are lists, not single numbers. A harness can have its own cap that
 *   overrides the default (a cheaper harness may run more at once); a ticket state can be
 *   capped (at most one ticket verifying at a time); and when a harness runs out of quota,
 *   work can move to the next harness in an ordered list. Each is edited as rows with
 *   plain add and remove. A state cap that Forge ships with can be changed but not removed
 *   (the server merges overrides over defaults, so a row cannot be deleted, only set), and
 *   the screen says so instead of offering a button that would do nothing.
 *
 * Exports: HarnessCaps, StateCaps, FallbackOrder.
 * Depends on: react, lucide-react, @forge/core (TicketStatus, types), components/settings/form-field,
 *   components/ui/button, components/ui/tooltip.
 */

import { TicketStatus } from '@forge/core';
import type { ForgeConfig } from '@forge/core';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { FormField, TextInput } from '#/components/settings/form-field.js';
import { Button } from '#/components/ui/button.js';
import { Tooltip } from '#/components/ui/tooltip.js';
import type {
  FieldErrors,
  FieldSetter as Setter,
} from '#/types/settings-fields.types.js';

const BY_ID = 'engine.max_concurrent_per_harness.by_id';
const BY_STATE = 'engine.max_concurrent_by_state';
const FALLBACKS = 'engine.harness_fallbacks';

const toCap = (raw: string): number => (raw === '' ? Number.NaN : Number(raw));
const shownCap = (n: number): number | '' => (Number.isNaN(n) ? '' : n);

function CapRow(props: {
  id: string;
  label: string;
  value: number;
  error: string | undefined;
  onChange: (n: number) => void;
  onRemove: (() => void) | undefined;
}) {
  return (
    <li className="grid gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor={props.id} className="min-w-0 flex-1 truncate font-data text-sm">
          {props.label}
        </label>
        <TextInput
          id={props.id}
          type="number"
          inputMode="numeric"
          value={shownCap(props.value)}
          error={props.error}
          className="max-w-24"
          onChange={(e) => props.onChange(toCap(e.target.value))}
        />
        {props.onRemove ? (
          <Tooltip content={`Remove ${props.label}`}>
            <button
              type="button"
              aria-label={`Remove ${props.label}`}
              onClick={props.onRemove}
              className="grid size-10 place-items-center rounded-lg text-muted transition-[background-color,transform] duration-150 hover:bg-hover active:translate-y-px"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </Tooltip>
        ) : (
          <span className="size-10" />
        )}
      </div>
      {props.error ? (
        <p role="alert" className="text-xs text-danger">
          {props.error}
        </p>
      ) : null}
    </li>
  );
}

export function HarnessCaps(props: {
  config: ForgeConfig;
  errors: FieldErrors;
  known: readonly string[];
  onChange: Setter;
}) {
  const caps = props.config.engine.max_concurrent_per_harness.by_id;
  const [name, setName] = useState('');
  const taken = name.trim() === '' || name.trim() in caps;

  return (
    <div className="grid gap-3">
      <p className="text-sm font-medium">Caps for a specific harness</p>
      {Object.keys(caps).length === 0 ? (
        <p className="text-sm text-muted">None. Every harness uses the default above.</p>
      ) : (
        <ul className="grid gap-2">
          {Object.entries(caps).map(([id, value]) => (
            <CapRow
              key={id}
              id={`cap-harness-${id}`}
              label={id}
              value={value}
              error={props.errors[`${BY_ID}.${id}`]}
              onChange={(n) => props.onChange(BY_ID, { ...caps, [id]: n })}
              onRemove={() => {
                props.onChange(
                  BY_ID,
                  Object.fromEntries(Object.entries(caps).filter(([key]) => key !== id)),
                );
              }}
            />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <FormField id="cap-harness-new" label="Add a harness cap">
          <TextInput
            id="cap-harness-new"
            list="known-harnesses"
            value={name}
            placeholder="Harness id"
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
          <datalist id="known-harnesses">
            {props.known.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
        </FormField>
        <Button
          disabled={taken}
          onClick={() => {
            props.onChange(BY_ID, { ...caps, [name.trim()]: 1 });
            setName('');
          }}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add
        </Button>
      </div>
    </div>
  );
}

export function StateCaps(props: {
  config: ForgeConfig;
  saved: ForgeConfig;
  errors: FieldErrors;
  onChange: Setter;
}) {
  const caps = props.config.engine.max_concurrent_by_state;
  const savedCaps = props.saved.engine.max_concurrent_by_state;
  const free = TicketStatus.options.filter((s) => !(s in caps));
  const [pick, setPick] = useState('');
  const chosen = free.find((s) => s === pick) ?? free[0];

  return (
    <div className="grid gap-3">
      <p className="text-sm font-medium">Tickets in one state at once</p>
      <ul className="grid gap-2">
        {Object.entries(caps).map(([state, value]) => (
          <CapRow
            key={state}
            id={`cap-state-${state}`}
            label={state}
            value={value}
            error={props.errors[`${BY_STATE}.${state}`]}
            onChange={(n) => props.onChange(BY_STATE, { ...caps, [state]: n })}
            onRemove={
              state in savedCaps
                ? undefined
                : () => {
                    props.onChange(
                      BY_STATE,
                      Object.fromEntries(
                        Object.entries(caps).filter(([key]) => key !== state),
                      ),
                    );
                  }
            }
          />
        ))}
      </ul>
      <p className="text-xs text-muted">
        A cap Forge ships with can be raised or lowered here, not removed.
      </p>
      {chosen ? (
        <div className="flex flex-wrap items-end gap-2">
          <FormField id="cap-state-new" label="Add a cap for a state">
            <select
              id="cap-state-new"
              value={chosen}
              onChange={(e) => setPick(e.target.value)}
              className="min-h-10 rounded-lg border border-line bg-surface px-3 text-sm"
            >
              {free.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </FormField>
          <Button onClick={() => props.onChange(BY_STATE, { ...caps, [chosen]: 1 })}>
            <Plus aria-hidden="true" className="size-4" />
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function FallbackOrder(props: { config: ForgeConfig; onChange: Setter }) {
  const list = props.config.engine.harness_fallbacks;
  const [text, setText] = useState(list.join(', '));

  return (
    <FormField
      id="fallbacks"
      label="When a harness is out of quota, try these next"
      hint="Harness ids separated by commas, in order. Leave empty to wait for the quota to return."
    >
      <TextInput
        id="fallbacks"
        hasHint
        value={text}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => {
          setText(e.target.value);
          props.onChange(
            FALLBACKS,
            e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s !== ''),
          );
        }}
      />
    </FormField>
  );
}
