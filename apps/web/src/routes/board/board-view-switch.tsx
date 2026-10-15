/**
 * BoardViewSwitch: the Cards | Tickets switch above the Board.
 *
 * Why: the Board has two views of the same work. Cards are the requests the user and the
 *   Director talk about; Tickets are the units Workers build. Both are one click away and the
 *   choice is remembered (state/board-prefs), so a user who lives in one view never has to
 *   pick it again after a reload. It sits above the loading, empty and error states so the way
 *   to the other view never disappears with the data.
 *
 * Exports: BoardViewSwitch.
 * Depends on: react, state/board-prefs.
 */

import { useBoardPrefs } from '#/state/board-prefs.js';

const OPTIONS = [
  { value: 'cards', label: 'Cards' },
  { value: 'tickets', label: 'Tickets' },
] as const;

export function BoardViewSwitch() {
  const { view, setView } = useBoardPrefs();

  return (
    <div
      role="group"
      aria-label="Board view"
      className="flex w-fit rounded-lg bg-hover p-0.5"
    >
      {OPTIONS.map((option) => {
        const on = view === option.value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => setView(option.value)}
            className={`min-h-9 rounded-md px-3 text-sm transition-[background-color,color] duration-150 ${
              on
                ? 'bg-surface font-medium shadow-[0_1px_2px_oklch(25%_0.03_255/0.12)]'
                : 'text-muted hover:text-fg'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
