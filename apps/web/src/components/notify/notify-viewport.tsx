/**
 * NotifyViewport: the one place notifications appear, anchored to a screen edge.
 *
 * Why: users must find every answer to their actions in the same spot, above dialogs, clear
 *   of the screen edges and the phone's home bar. The newest card sits nearest the edge and
 *   older ones peek out behind it, fanning out on hover or focus so each can be read and
 *   acted on. While it is hovered, focused or the tab is hidden nothing expires. Success,
 *   info and progress sit in an always-mounted polite live region; errors and warnings carry
 *   `role="alert"` on the card itself (an always-present alert container would read as a
 *   permanent error to assistive tech and tests alike); and F8 moves keyboard focus here from anywhere. With two or more closable cards a
 *   "Close all" button sits just outside the stack (never over a card) and closes them in one go,
 *   leaving running tasks and non-dismissible cards, then announces how many closed.
 *
 * Exports: NotifyViewport.
 * Depends on: react, motion/react, components/notify/notify-item, domain/notify-config,
 *   state/notify/*, types/notify.types.
 */

import { AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { NotifyItem } from '#/components/notify/notify-item.js';
import {
  isRunningTask,
  selectVisible,
  stackHeight,
  stackOffset,
  stackScale,
} from '#/domain/notify-config.js';
import { useNotifyConfig } from '#/state/notify/notify-context.js';
import { notifyStore, useNotifyStore } from '#/state/notify/notify-store.js';
import type { NotifyItem as Item, NotifyPosition } from '#/types/notify.types.js';

const PLACEMENT: Readonly<Record<NotifyPosition, string>> = {
  'bottom-center': 'left-1/2 -translate-x-1/2',
  'top-center': 'left-1/2 -translate-x-1/2',
  'bottom-right': '',
  'top-right': '',
};

function usePageHidden(): boolean {
  const [hidden, setHidden] = useState(
    typeof document !== 'undefined' && document.visibilityState === 'hidden',
  );

  useEffect(() => {
    const onChange = () => setHidden(document.visibilityState === 'hidden');

    document.addEventListener('visibilitychange', onChange);

    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return hidden;
}

function isAssertive(item: Item): boolean {
  return item.tone === 'error' || item.tone === 'warning';
}

export function NotifyViewport() {
  const config = useNotifyConfig();
  const items = useNotifyStore((state) => state.items);
  const root = useRef<HTMLElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [heights, setHeights] = useState<Readonly<Record<string, number>>>({});
  const pageHidden = usePageHidden();
  const bottom = config.position.startsWith('bottom');
  const direction = bottom ? -1 : 1;
  const expanded = hovered || focused;
  const paused = expanded || pageHidden;
  const visible = selectVisible(items, config.max);
  const newestFirst = [...visible].reverse();
  const measured = newestFirst.map((item) => heights[item.id] ?? 0);

  const onMeasure = useCallback((id: string, height: number) => {
    setHeights((current) =>
      current[id] === height ? current : { ...current, [id]: height },
    );
  }, []);

  useEffect(() => {
    if (announcement === '') {
      return undefined;
    }

    const timer = setTimeout(() => setAnnouncement(''), 2000);

    return () => clearTimeout(timer);
  }, [announcement]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'F8') {
        event.preventDefault();
        root.current?.focus();
      }
    };

    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const edge = `calc(env(safe-area-inset-${bottom ? 'bottom' : 'top'}, 0px) + ${config.offset}px)`;
  const style: CSSProperties = {
    [bottom ? 'bottom' : 'top']: edge,
    ...(config.position.endsWith('right') ? { right: config.offset } : {}),
    height: stackHeight(measured, expanded, config.gap),
  };

  const closable = visible.filter((item) => item.dismissible && !isRunningTask(item));
  const closeEdge = bottom ? 'bottom-full mb-2' : 'top-full mt-2';

  function closeAll(): void {
    const closed = notifyStore.dismissAll();

    // The button leaves with the cards; keep keyboard focus in the stack (F8 target).
    root.current?.focus();
    setAnnouncement(`Closed ${closed} notification${closed === 1 ? '' : 's'}`);
  }

  function renderCards(list: readonly Item[]) {
    return list.map((item) => {
      const depth = newestFirst.indexOf(item);

      return (
        <NotifyItem
          key={item.id}
          item={item}
          depth={depth}
          expanded={expanded}
          paused={paused}
          offset={stackOffset(depth, measured, expanded, config.gap)}
          scale={stackScale(depth, expanded)}
          direction={direction}
          frontHeight={measured[0] ?? 0}
          onMeasure={onMeasure}
        />
      );
    });
  }

  return (
    <section
      ref={root}
      tabIndex={-1}
      aria-label="Notifications"
      aria-describedby="notify-hint"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false);
        }
      }}
      onKeyDown={(event) => {
        const newest = newestFirst.find((item) => item.dismissible);

        if (event.key === 'Escape' && event.target === event.currentTarget && newest) {
          notifyStore.dismiss(newest.id);
        }
      }}
      className={`fixed z-[70] w-[min(420px,calc(100vw-2rem))] outline-none ${PLACEMENT[config.position]} ${
        visible.length === 0 ? 'pointer-events-none' : ''
      }`}
      style={style}
    >
      <p id="notify-hint" className="sr-only">
        Notifications. Press F8 to move focus here, Escape to dismiss.
      </p>
      <div aria-live="polite" aria-relevant="additions text" className="contents">
        <p className="sr-only">{announcement}</p>
        <AnimatePresence>
          {renderCards(visible.filter((item) => !isAssertive(item)))}
        </AnimatePresence>
      </div>
      <div className="contents">
        <AnimatePresence>{renderCards(visible.filter(isAssertive))}</AnimatePresence>
      </div>
      {closable.length >= 2 ? (
        <button
          type="button"
          onClick={closeAll}
          aria-label={`Close all ${closable.length} notifications`}
          className={`absolute right-0 ${closeEdge} min-h-8 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-muted shadow-float transition-colors hover:bg-hover motion-reduce:transition-none`}
        >
          Close all
        </button>
      ) : null}
    </section>
  );
}
