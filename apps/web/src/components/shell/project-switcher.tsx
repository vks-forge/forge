/**
 * ProjectSwitcher: the dropdown at the top of the sidebar that changes the project in place.
 *
 * Why: Forge has no company-wide home; the user always works inside one project and must be
 *   able to hop to another without losing their place (d-0104). Choosing a project keeps the
 *   same screen under the new project and changes the whole view without a reload. If the
 *   current view holds unsaved edits, the shell's leave guard asks first. `Ctrl+K` (or Cmd+K)
 *   opens the list from anywhere so keyboard users never need the pointer. Loading, empty and
 *   error states live in the trigger and the menu, because this control is the first thing
 *   that depends on the server.
 *
 * Exports: ProjectSwitcher. The menu ends with "Add project" (`/projects/new`).
 * Depends on: react, react-router, @radix-ui/react-dropdown-menu, motion/react, lucide-react,
 *   api/use-projects, domain/nav-entries, state/current-project, theme/motion.
 */

import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronsUpDown, CircleAlert, Plus, TriangleAlert } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useProjects } from '#/api/use-projects.js';
import { swapProjectSlug } from '#/domain/nav-entries.js';
import { useCurrentSlug } from '#/state/current-project.js';
import { popVariants } from '#/theme/motion.js';

const SHORTCUT = /Mac|iPhone|iPad/.test(globalThis.navigator?.userAgent ?? '')
  ? '⌘K'
  : 'Ctrl K';

const ROW =
  'flex min-h-9 cursor-default select-none items-center gap-2 rounded-md px-2 text-sm outline-none data-[highlighted]:bg-hover';

function TriggerLabel(props: { query: ReturnType<typeof useProjects>; slug?: string }) {
  const { query, slug } = props;
  if (query.isPending) {
    return (
      <span className="h-4 w-28 animate-pulse rounded bg-hover" aria-hidden="true" />
    );
  }

  if (query.isError) {
    return (
      <>
        <CircleAlert aria-hidden="true" className="size-4 shrink-0 text-danger" />
        <span className="truncate text-muted">Projects unavailable</span>
      </>
    );
  }

  const project = query.data.find((p) => p.slug === slug);
  if (!project) {
    return <span className="truncate text-muted">No projects yet</span>;
  }

  return (
    <>
      <span className="rounded-md border border-line bg-bg px-1.5 font-data text-[0.68rem] font-medium text-muted">
        {project.prefix}
      </span>
      <span className="truncate font-medium">{project.slug}</span>
    </>
  );
}

function MenuBody(props: {
  query: ReturnType<typeof useProjects>;
  slug?: string;
  onPick: (slug: string) => void;
}) {
  const { query, slug, onPick } = props;
  if (query.isPending) {
    return <p className="px-2 py-2 text-sm text-muted">Loading projects</p>;
  }

  if (query.isError) {
    return (
      <div className="grid gap-1 p-1">
        <p className="px-2 py-1 text-sm">{query.error.message}</p>
        <Menu.Item
          className={`${ROW} font-medium text-signal`}
          onSelect={(event) => {
            event.preventDefault();
            void query.refetch();
          }}
        >
          Try again
        </Menu.Item>
      </div>
    );
  }

  if (query.data.length === 0) {
    return <p className="px-2 py-2 text-sm text-muted">No projects yet.</p>;
  }

  return (
    <Menu.RadioGroup {...(slug ? { value: slug } : {})} onValueChange={onPick}>
      {query.data.map((project) => (
        <Menu.RadioItem key={project.id} value={project.slug} className={ROW}>
          <span className="w-4">
            <Menu.ItemIndicator>
              <Check aria-hidden="true" className="size-4 text-signal" />
            </Menu.ItemIndicator>
          </span>
          <span className="rounded-md border border-line bg-bg px-1.5 font-data text-[0.68rem] font-medium text-muted">
            {project.prefix}
          </span>
          <span className="min-w-0 flex-1 truncate">{project.slug}</span>
          {project.config_error ? (
            <TriangleAlert
              aria-label="Settings need attention"
              className="size-4 shrink-0 text-attn"
            />
          ) : null}
          {project.status === 'onboarding' ? (
            <span className="text-xs text-muted">setting up</span>
          ) : null}
        </Menu.RadioItem>
      ))}
    </Menu.RadioGroup>
  );
}

export function ProjectSwitcher() {
  const query = useProjects();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const slug = useCurrentSlug(query.data);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (next: string): void => {
    if (next !== slug) {
      void navigate(swapProjectSlug(pathname, next));
    }
  };

  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Menu.Trigger
        aria-label="Switch project"
        aria-busy={query.isPending || undefined}
        className="group flex min-h-10 w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-sm transition-[transform,background-color] duration-150 hover:bg-hover active:translate-y-px data-[state=open]:bg-hover"
      >
        <TriggerLabel query={query} {...(slug ? { slug } : {})} />
        <span className="ml-auto hidden items-center gap-1.5 md:flex">
          <kbd className="rounded border border-line px-1 font-data text-[0.65rem] text-faint">
            {SHORTCUT}
          </kbd>
        </span>
        <ChevronsUpDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted md:ml-0"
        />
      </Menu.Trigger>
      <AnimatePresence>
        {open ? (
          <Menu.Portal forceMount>
            <Menu.Content forceMount asChild align="start" sideOffset={6}>
              <motion.div
                variants={popVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                style={{
                  transformOrigin: 'var(--radix-dropdown-menu-content-transform-origin)',
                }}
                className="z-50 max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] min-w-[var(--radix-dropdown-menu-trigger-width)] max-w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-float"
              >
                <MenuBody query={query} {...(slug ? { slug } : {})} onPick={pick} />
                <Menu.Separator className="my-1 h-px bg-line" />
                <Menu.Item
                  className={`${ROW} font-medium`}
                  onSelect={() => void navigate('/projects/new')}
                >
                  <Plus aria-hidden="true" className="size-4 text-muted" />
                  Add project
                </Menu.Item>
              </motion.div>
            </Menu.Content>
          </Menu.Portal>
        ) : null}
      </AnimatePresence>
    </Menu.Root>
  );
}
