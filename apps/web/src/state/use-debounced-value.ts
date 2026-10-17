/**
 * `useDebouncedValue()`: a value that follows another one a moment after it stops changing.
 *
 * Why: the pipeline editor asks the server to judge the list being edited, and a request per
 *   keystroke or click would be noise for the server and flicker for the owner. Waiting until the
 *   edits pause sends one request for the text that is actually on screen.
 *
 * Exports: useDebouncedValue().
 * Depends on: react.
 */

import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);

    return () => clearTimeout(timer);
  }, [value, ms]);

  return settled;
}
