/**
 * SearchBox: the one memory search field, with its keyboard rules.
 *
 * Why: the owner hunts for "did we already decide this?" and should not have to press anything
 *   to find out. Typing searches after a short pause (250 ms) so a request is not sent per
 *   letter; Enter searches at once; Esc empties the box and leaves search; `/` jumps to the box
 *   from anywhere on the page, the usual shortcut. One letter is too broad to mean anything, so
 *   the box says how many characters it needs instead of silently doing nothing. The text in the
 *   box follows the address, so Back, a shared link and "Clear filters" all move it.
 *
 * Exports: SearchBox, SEARCH_DEBOUNCE_MS.
 * Depends on: react, lucide-react, components/ui/field, domain/memory-search-params.
 */

import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { INPUT_CLASS } from '#/components/ui/field.js';
import { MIN_QUERY_LENGTH } from '#/domain/memory-search-params.js';

export const SEARCH_DEBOUNCE_MS = 250;

export function SearchBox(props: { value: string; onCommit: (text: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(props.value);
  const { value, onCommit } = props;

  // The address is the source of truth: follow it when it changes under the box (adjusting
  // state while rendering, not in an effect, so there is no extra render with stale text).
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(value);
  }

  useEffect(() => {
    if (text === value) {
      return;
    }

    const timer = window.setTimeout(() => onCommit(text), SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [text, value, onCommit]);

  useEffect(() => {
    const focus = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement;
      const typing = /^(input|textarea|select)$/i.test(target.tagName);
      if (event.key === '/' && !typing && !target.isContentEditable) {
        event.preventDefault();
        input.current?.focus();
      }
    };

    window.addEventListener('keydown', focus);

    return () => window.removeEventListener('keydown', focus);
  }, []);

  const tooShort = text.trim().length > 0 && text.trim().length < MIN_QUERY_LENGTH;

  return (
    <div className="grid gap-1.5">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint"
        />
        <input
          ref={input}
          type="search"
          aria-label="Search memory"
          aria-describedby={tooShort ? 'memory-search-hint' : undefined}
          placeholder="Search by words, id or tag (press /)"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onCommit(text);
            } else if (event.key === 'Escape' && text !== '') {
              event.preventDefault();
              setText('');
              onCommit('');
            }
          }}
          className={`${INPUT_CLASS} pl-9 ${text !== '' ? 'pr-10' : ''}`}
        />
        {text !== '' ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setText('');
              onCommit('');
              input.current?.focus();
            }}
            className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-hover"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>
      {tooShort ? (
        <p id="memory-search-hint" className="text-xs text-muted">
          Type at least {MIN_QUERY_LENGTH} characters to search.
        </p>
      ) : null}
    </div>
  );
}
