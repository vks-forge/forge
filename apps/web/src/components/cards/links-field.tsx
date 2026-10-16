/**
 * LinksField: a list of web links the Director should read as context for a card.
 *
 * Why: a request often points at an issue, a doc or a design the user does not want to
 *   paste. The Director reads these links with the request, so a link that is not a real
 *   http or https address would only waste a fetch. The box checks the address when it is
 *   added (Enter or the Add button), says what is wrong in words and keeps the text so a typo
 *   is one edit away; added links sit in a list with a labelled remove button, so nothing is
 *   hidden behind an icon alone.
 *
 * Exports: LinksField.
 * Depends on: react, lucide-react, components/ui/{button,field}, schemas/new-card (isWebUrl).
 */

import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '#/components/ui/button.js';
import { Field, INPUT_CLASS } from '#/components/ui/field.js';
import { isWebUrl } from '#/schemas/new-card.js';

export function LinksField(props: {
  id: string;
  links: readonly string[];
  onChange: (links: readonly string[]) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();

  const add = (): void => {
    const link = text.trim();

    if (link === '') {
      return;
    }

    if (!isWebUrl(link)) {
      setError('A link must start with http:// or https://.');

      return;
    }

    if (props.links.includes(link)) {
      setError('That link is already in the list.');

      return;
    }

    props.onChange([...props.links, link]);
    setText('');
    setError(undefined);
  };

  return (
    <Field
      id={props.id}
      label="Links"
      hint="Pages the Director should read as context: an issue, a doc, a design."
      error={error}
    >
      <div className="flex gap-2">
        <input
          id={props.id}
          type="url"
          inputMode="url"
          autoComplete="off"
          value={text}
          disabled={props.disabled}
          placeholder="https://"
          aria-invalid={error !== undefined || undefined}
          aria-describedby={`${props.id}-hint${error ? ` ${props.id}-error` : ''}`}
          onChange={(event) => {
            setText(event.target.value);
            setError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              // Enter adds the link; it must not submit the whole card.
              event.preventDefault();
              event.stopPropagation();
              add();
            }
          }}
          className={INPUT_CLASS}
        />
        <Button disabled={props.disabled || text.trim() === ''} onClick={add}>
          <Plus aria-hidden="true" className="size-4" />
          Add link
        </Button>
      </div>
      {props.links.length > 0 ? (
        <ul aria-label="Added links" className="grid gap-1.5">
          {props.links.map((link) => (
            <li
              key={link}
              className="flex items-center justify-between gap-2 rounded-lg bg-hover py-1 pl-3 pr-1 text-sm"
            >
              <span className="min-w-0 truncate font-data text-xs">{link}</span>
              <button
                type="button"
                aria-label={`Remove link ${link}`}
                disabled={props.disabled}
                onClick={() => props.onChange(props.links.filter((l) => l !== link))}
                className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-muted transition-colors duration-150 hover:bg-surface hover:text-fg disabled:opacity-50"
              >
                <X aria-hidden="true" className="size-3.5" />
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Field>
  );
}
