/**
 * SectionNav: the sticky in-page tab bar of a long settings page.
 *
 * Why: a harness page has five sections (sign-in, credential, test, compatibility, tools)
 *   stacked in one column. The owner needs to jump between them without losing the page, see
 *   which one is on screen, and keep the bar in reach while scrolling. So the bar sticks under
 *   the top edge (below the phone header), gains a background and a shadow only once it is
 *   stuck, follows the section in view (scroll-spy), and a click scrolls smoothly (instantly
 *   for people who asked for reduced motion), writes the section into the URL hash without
 *   jumping, and moves focus to the section heading so a keyboard or screen-reader user
 *   lands where the page scrolled. It publishes its own height as `--settings-nav-offset` so
 *   section cards can leave that much room above their headings.
 *
 * Exports: SectionNav.
 * Depends on: react, types/settings-ui.types. Browser: IntersectionObserver, history.
 */

import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { HeroTab } from '#/types/settings-ui.types.js';

const OFFSET_VAR = '--settings-nav-offset';

/** Page gap above the bar (2rem) plus the sentinel's own pixel: where the bar sits below its sentinel. */
const SENTINEL_TO_BAR = 33;

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function goTo(id: string): void {
  const section = document.getElementById(id);
  if (!section) {
    return;
  }

  section.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  });

  const heading = section.querySelector<HTMLElement>('h2, h3');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}

export function SectionNav(props: { tabs: readonly HeroTab[] }) {
  const { tabs } = props;
  const nav = useRef<HTMLElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(() => {
    const hashed = typeof window === 'undefined' ? '' : window.location.hash.slice(1);

    return tabs.some((t) => t.id === hashed) ? hashed : (tabs[0]?.id ?? '');
  });

  const [stuck, setStuck] = useState(false);
  const key = tabs.map((t) => t.id).join('|');

  // Publish where the bar ends, so cards scroll to just below it.
  useEffect(() => {
    const bar = nav.current;
    if (!bar) {
      return undefined;
    }

    const root = document.documentElement;
    const publish = (): void => {
      const top = Number.parseFloat(getComputedStyle(bar).top) || 0;
      root.style.setProperty(OFFSET_VAR, `${top + bar.offsetHeight}px`);
    };

    publish();
    window.addEventListener('resize', publish);

    return () => {
      window.removeEventListener('resize', publish);
      root.style.removeProperty(OFFSET_VAR);
    };
  }, []);

  // Stuck: the sentinel above the bar has scrolled under the bar's top edge.
  useEffect(() => {
    const bar = nav.current;
    const marker = sentinel.current;
    if (!bar || !marker || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const top = Number.parseFloat(getComputedStyle(bar).top) || 0;
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(entry ? !entry.isIntersecting : false),
      { rootMargin: `${SENTINEL_TO_BAR - top}px 0px 0px 0px`, threshold: 0 },
    );

    observer.observe(marker);

    return () => observer.disconnect();
  }, []);

  // Scroll-spy: the first section (in page order) that is inside the reading band is active.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const ids = key.split('|');
    const visible = new Set<string>();
    const offset = nav.current
      ? (Number.parseFloat(getComputedStyle(nav.current).top) || 0) +
        nav.current.offsetHeight
      : 0;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.add(entry.target.id);
          } else {
            visible.delete(entry.target.id);
          }
        }

        const first = ids.find((id) => visible.has(id));
        if (first) {
          setActive(first);
        }
      },
      { rootMargin: `-${offset + 16}px 0px -55% 0px`, threshold: 0 },
    );

    for (const id of ids) {
      const section = document.getElementById(id);
      if (section) {
        observer.observe(section);
      }
    }

    return () => observer.disconnect();
  }, [key]);

  // A link with a hash opens at its section.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id && key.split('|').includes(id)) {
      goTo(id);
    }
  }, [key]);

  const onClick = (event: MouseEvent, id: string): void => {
    event.preventDefault();
    setActive(id);
    window.history.replaceState(window.history.state, '', `#${id}`);
    goTo(id);
  };

  return (
    <>
      <div ref={sentinel} aria-hidden="true" className="-my-4 h-px" />
      <nav
        ref={nav}
        aria-label="On this page"
        className={`sticky top-12 z-20 flex gap-1 overflow-x-auto border-b border-line px-1 transition-shadow duration-150 md:top-0 ${
          stuck ? 'bg-bg shadow-float' : 'bg-transparent'
        }`}
      >
        {tabs.map((tab) => (
          <a
            key={tab.id}
            href={`#${tab.id}`}
            aria-current={tab.id === active ? 'true' : undefined}
            onClick={(event) => onClick(event, tab.id)}
            className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 border-transparent px-3 text-sm text-muted transition-colors duration-150 hover:text-fg aria-[current=true]:border-signal aria-[current=true]:font-medium aria-[current=true]:text-fg"
          >
            {tab.label}
          </a>
        ))}
      </nav>
    </>
  );
}
