/**
 * AppShell: the frame around every screen: sidebar, mobile bar, and the animated page area.
 *
 * Why: whatever the user is looking at, the same map (sidebar) and the same safety net (the
 *   leave guard) must be there, and the content must stay readable from a 320 px phone to a
 *   wide monitor with no sideways scroll. On wide screens the sidebar is a fixed column; on
 *   narrow ones a top bar opens it as a drawer, and it closes itself when a destination is
 *   chosen. A "skip to content" link lets keyboard users jump past the navigation.
 *
 * Exports: AppShell.
 * Depends on: react, react-router, components/brand/forge-mark, lucide-react, state/use-media-query,
 *   components/shell/*, components/motion/page-transition, components/ui/tooltip.
 */

import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ForgeMark } from '#/components/brand/forge-mark.js';
import { PageTransition } from '#/components/motion/page-transition.js';
import { LeaveGuard } from '#/components/shell/leave-guard.js';
import { MobileDrawer } from '#/components/shell/mobile-drawer.js';
import { SidebarContent } from '#/components/shell/sidebar-content.js';
import { Tooltip } from '#/components/ui/tooltip.js';
import { OVERVIEW_PATH } from '#/domain/nav-entries.js';
import { useMediaQuery } from '#/state/use-media-query.js';

export function AppShell() {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const { pathname } = useLocation();
  // The drawer is "open on this path": choosing a destination changes the path, which closes it
  // with no effect needed.
  const [openOn, setOpenOn] = useState<string | null>(null);
  // The Board is a row of columns and needs more room than a reading column.
  const wide = /^\/p\/[^/]+\/board\/?$/.test(pathname);
  const drawerOpen = openOn === pathname;
  const setDrawerOpen = (open: boolean): void => setOpenOn(open ? pathname : null);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-surface px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
      >
        Skip to content
      </a>
      <LeaveGuard />
      {isMobile ? null : (
        <aside className="sticky top-0 h-dvh w-64 shrink-0 border-r border-line bg-rail">
          <SidebarContent />
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {isMobile ? (
          <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-line bg-bg px-2">
            <Tooltip content="Open navigation" side="bottom">
              <button
                type="button"
                aria-label="Open navigation"
                onClick={() => setDrawerOpen(true)}
                className="grid size-10 place-items-center rounded-lg text-muted transition-[background-color,transform] duration-150 hover:bg-hover active:translate-y-px"
              >
                <Menu aria-hidden="true" className="size-5" />
              </button>
            </Tooltip>
            <Link
              to={OVERVIEW_PATH}
              className="flex items-center gap-2 text-base font-semibold tracking-tight"
            >
              <ForgeMark size={32} />
              Forge
            </Link>
          </header>
        ) : null}
        <main
          id="main"
          tabIndex={-1}
          className={`mx-auto w-full min-w-0 flex-1 px-4 py-6 outline-none md:px-8 md:py-9 ${wide ? 'max-w-[1480px]' : 'max-w-[1240px]'}`}
        >
          <PageTransition />
        </main>
      </div>
      {isMobile ? <MobileDrawer open={drawerOpen} onOpenChange={setDrawerOpen} /> : null}
    </div>
  );
}
