/**
 * ChipInput: a short list of words (globs, skill names, memory tags) typed one at a time.
 *
 * Why: write scopes, skills and memory tags are small lists where each item is one token, and a
 *   multi-line box invites a stray blank line or a trailing newline that turns into an empty
 *   entry. One field plus an Add button (Enter does the same) adds an item, each item is a chip
 *   with its own remove button named after it, and a duplicate is refused in words instead of
 *   being added twice. Everything is reachable with the keyboard alone.
 *
 * Exports: ChipInput.
 * Depends on: react, lucide-react, components/ui/button, components/settings/form-field.
 */

import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { TextInput } from '#/components/settings/form-field.js';
import { Button } from '#/components/ui/button.js';

export function ChipInput(props: {
  id: string;
  label: string;
  values: readonly string[];
  onChange: (next: readonly string[]) => void;
  placeholder?: string;
  hint?: string;
  error?: string | undefined;
  disabled?: boolean;
  /** What an empty list means, shown under the field. */
  emptyNote?: string;
}) {
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  function add(): void {
    const word = draft.trim();
    if (word === '') {
      return;
    }

    if (props.values.includes(word)) {
      setProblem(`“${word}” is already in the list.`);

      return;
    }

    props.onChange([...props.values, word]);
    setDraft('');
    setProblem(null);
  }

  return (
    <div className="grid max-w-xl gap-1.5">
      <label htmlFor={props.id} className="text-sm font-medium">
        {props.label}
      </label>
      <div className="flex gap-2">
        <TextInput
          id={props.id}
          value={draft}
          disabled={props.disabled}
          placeholder={props.placeholder}
          autoComplete="off"
          spellCheck={false}
          hasHint={props.hint !== undefined}
          error={problem ?? props.error}
          onChange={(event) => {
            setDraft(event.target.value);
            setProblem(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button
          onClick={add}
          disabled={props.disabled || draft.trim() === ''}
          aria-label={`Add to ${props.label}`}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add
        </Button>
      </div>
      {props.hint ? (
        <p id={`${props.id}-hint`} className="text-xs text-muted">
          {props.hint}
        </p>
      ) : null}
      {(problem ?? props.error) ? (
        <p id={`${props.id}-error`} role="alert" className="text-xs text-danger">
          {problem ?? props.error}
        </p>
      ) : null}
      {props.values.length > 0 ? (
        <ul aria-label={`${props.label} list`} className="flex flex-wrap gap-1.5">
          {props.values.map((value) => (
            <li
              key={value}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-hover py-0.5 pl-2 pr-0.5 font-data text-xs"
            >
              {value}
              <button
                type="button"
                disabled={props.disabled}
                aria-label={`Remove ${value}`}
                onClick={() => props.onChange(props.values.filter((v) => v !== value))}
                className="grid size-6 place-items-center rounded text-muted hover:bg-line hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : props.emptyNote ? (
        <p className="text-xs text-muted">{props.emptyNote}</p>
      ) : null}
    </div>
  );
}
