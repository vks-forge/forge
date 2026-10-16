/**
 * NotifyItem: one notification card in the stack.
 *
 * Why: after an action the user needs a short, calm answer in the same place every time:
 *   what happened (title, optional detail), how it went (icon colour and a thin left accent,
 *   never a loud fill), and what they can do (an action such as Undo, Cancel for a running
 *   job, a close button). Success and info leave on their own, errors wait, and the timer
 *   stops while the stack is hovered, focused or the tab is hidden. Cards move with the
 *   shared springs on `transform` and `opacity` only; Esc closes the focused card and a
 *   swipe toward the screen edge dismisses it on touch.
 *
 * Exports: NotifyItem.
 * Depends on: react, motion/react, lucide-react, components/ui/button,
 *   components/ui/tooltip, components/notify/notify-task-body, domain/notify-config, state/notify/*, theme/motion,
 *   types/notify.types.
 */

import {
  CircleAlert,
  CircleCheck,
  Info,
  LoaderCircle,
  TriangleAlert,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { NotifyTaskBody } from '#/components/notify/notify-task-body.js';
import { Button } from '#/components/ui/button.js';
import { Tooltip } from '#/components/ui/tooltip.js';
import { isRunningTask, resolveDuration } from '#/domain/notify-config.js';
import { useNotify, useNotifyConfig } from '#/state/notify/notify-context.js';
import { useCountdown } from '#/state/notify/use-countdown.js';
import { springs } from '#/theme/motion.js';
import type { NotifyItem as Item, NotifyTone } from '#/types/notify.types.js';

const TONE: Readonly<
  Record<NotifyTone, { icon: typeof Info; text: string; bar: string }>
> = {
  success: { icon: CircleCheck, text: 'text-good', bar: 'bg-good' },
  error: { icon: CircleAlert, text: 'text-danger', bar: 'bg-danger' },
  info: { icon: Info, text: 'text-signal', bar: 'bg-signal' },
  warning: { icon: TriangleAlert, text: 'text-attn', bar: 'bg-attn' },
  loading: { icon: LoaderCircle, text: 'text-muted', bar: 'bg-line' },
};

const SWIPE_PX = 40;

export function NotifyItem(props: {
  item: Item;
  /** 0 is the newest card. */
  depth: number;
  expanded: boolean;
  paused: boolean;
  /** Distance from the screen edge, px, already worked out by the stack. */
  offset: number;
  scale: number;
  /** +1 when the stack grows downward from the top edge, -1 upward from the bottom. */
  direction: 1 | -1;
  /** Height of the newest card: older cards are clipped to it while the stack is collapsed. */
  frontHeight: number;
  onMeasure: (id: string, height: number) => void;
}) {
  const { item, depth, expanded, direction } = props;
  const notify = useNotify();
  const config = useNotifyConfig();
  const [cancelling, setCancelling] = useState(false);
  const running = isRunningTask(item);
  const tone = TONE[item.tone];
  const Icon = tone.icon;
  const hidden = !expanded && depth > 2;

  const dismiss = () => notify.dismiss(item.id);

  useCountdown(resolveDuration(item, config), props.paused, item.revision, dismiss);

  async function runAction(): Promise<void> {
    const result = await item.action?.onClick();

    if (result !== false && !running) {
      dismiss();
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && item.dismissible) {
      event.stopPropagation();
      dismiss();
    }
  }

  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0"
      style={{ [direction === 1 ? 'top' : 'bottom']: 0, zIndex: 100 - depth }}
      initial={{ opacity: 0, y: -direction * 24, scale: 0.96 }}
      animate={{
        opacity: hidden ? 0 : 1,
        y: direction * props.offset,
        scale: props.scale,
      }}
      exit={{ opacity: 0, y: -direction * 16, transition: { duration: 0.12 } }}
      transition={springs.smooth}
    >
      <motion.div
        onKeyDown={onKeyDown}
        {...(item.tone === 'error' || item.tone === 'warning' ? { role: 'alert' } : {})}
        drag={item.dismissible ? 'y' : false}
        dragSnapToOrigin
        dragElastic={0.3}
        dragConstraints={{ top: 0, bottom: 0 }}
        onDragEnd={(_event, info) => {
          if (info.offset.y * direction > SWIPE_PX) {
            dismiss();
          }
        }}
        className={`relative overflow-hidden rounded-xl border border-line bg-surface shadow-float ${
          hidden ? 'pointer-events-none' : 'pointer-events-auto'
        }`}
        style={{
          transformOrigin: direction === 1 ? 'top center' : 'bottom center',
          ...(!expanded && depth > 0 ? { height: props.frontHeight } : {}),
        }}
      >
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 w-[3px] ${tone.bar}`}
        />
        <MeasuredBox id={item.id} onMeasure={props.onMeasure}>
          <div className="flex items-start gap-3 py-3 pl-4 pr-2">
            <span className={`mt-0.5 shrink-0 ${tone.text}`}>
              {item.icon ?? (
                <Icon
                  aria-hidden="true"
                  className={`size-4 ${
                    item.tone === 'loading'
                      ? 'animate-spin motion-reduce:animate-none'
                      : ''
                  }`}
                />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-medium">{item.title}</p>
              {item.description ? (
                <p
                  className="mt-0.5 break-words text-[13px] text-muted"
                  {...(running ? { 'aria-live': 'off' as const } : {})}
                >
                  {item.description}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {running && item.onCancel ? (
                <Button
                  className="min-h-8 px-2.5"
                  disabled={cancelling}
                  onClick={() => {
                    setCancelling(true);
                    item.onCancel?.();
                  }}
                >
                  {cancelling ? 'Cancelling…' : 'Cancel'}
                </Button>
              ) : null}
              {item.action ? (
                <Button className="min-h-8 px-2.5" onClick={() => void runAction()}>
                  {item.action.label}
                </Button>
              ) : null}
              {item.dismissible ? (
                <Tooltip content="Dismiss">
                  <button
                    type="button"
                    aria-label="Dismiss notification"
                    onClick={dismiss}
                    className="grid size-8 place-items-center rounded-lg text-muted hover:bg-hover"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                </Tooltip>
              ) : null}
            </div>
          </div>
          <div className="min-w-0 pb-3 pl-[2.75rem] pr-3 empty:hidden">
            <NotifyTaskBody
              title={item.title}
              progress={item.tone === 'loading' ? item.progress : undefined}
              steps={item.steps}
              live={running}
            />
          </div>
        </MeasuredBox>
      </motion.div>
    </motion.div>
  );
}

/** Reports the natural height of its content, so the stack can lay cards out without guessing. */
function MeasuredBox(props: {
  id: string;
  onMeasure: (id: string, height: number) => void;
  children: ReactNode;
}) {
  const { id, onMeasure } = props;
  const measure = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) {
        return undefined;
      }

      onMeasure(id, node.offsetHeight);

      const observer = new ResizeObserver(() => onMeasure(id, node.offsetHeight));

      observer.observe(node);

      return () => observer.disconnect();
    },
    [id, onMeasure],
  );

  return <div ref={measure}>{props.children}</div>;
}
