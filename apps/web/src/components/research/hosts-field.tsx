/**
 * HostsField: a list of host names edited as one per line.
 *
 * Why: research settings hold four host lists (which hosts may host the search engine,
 *   which pages may be read, which never). A row of chips for each would bury the screen; a
 *   plain box with one host per line is how owners already edit allow and deny lists. The box
 *   keeps what is typed (a half-written line, a trailing blank line) in its own text and only
 *   hands the cleaned list up, so typing never fights the cursor; when the list changes from
 *   outside (Discard, Reload) the text follows it. Problems with an entry arrive as one
 *   sentence under the box.
 *
 * Exports: HostsField.
 * Depends on: react, components/settings/form-field, components/ui/field, domain/settings-draft.
 */

import { useState } from 'react';
import { FormField } from '#/components/settings/form-field.js';
import { INPUT_CLASS } from '#/components/ui/field.js';
import { parseLines } from '#/domain/settings-draft.js';

export function HostsField(props: {
  id: string;
  label: string;
  hint: string;
  value: readonly string[];
  placeholder?: string;
  error?: string | undefined;
  disabled?: boolean;
  onChange: (hosts: string[]) => void;
}) {
  const joined = props.value.join('\n');
  const [text, setText] = useState(joined);
  const [seen, setSeen] = useState(joined);

  // Follow a change that did not come from typing here (Discard, Reload, a project switch):
  // adjusted while rendering, as React advises, so no stale frame is drawn.
  if (seen !== joined) {
    setSeen(joined);

    if (parseLines(text).join('\n') !== joined) {
      setText(joined);
    }
  }

  return (
    <FormField id={props.id} label={props.label} hint={props.hint} error={props.error}>
      <textarea
        id={props.id}
        rows={Math.max(2, parseLines(text).length + 1)}
        value={text}
        disabled={props.disabled}
        placeholder={props.placeholder}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={`${props.id}-hint${props.error ? ` ${props.id}-error` : ''}`}
        className={`${INPUT_CLASS} py-2 font-data`}
        onChange={(event) => {
          setText(event.target.value);
          props.onChange(parseLines(event.target.value));
        }}
      />
    </FormField>
  );
}
