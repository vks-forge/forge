/**
 * WorkLayout: the frame of the Card and Ticket pages, with the chat as the main column.
 *
 * Why: the owner must always be able to read and type in the chat, and still review the plan or
 *   a ticket's work beside it (d-0172, restoring d-0134). From 1280 px the chat takes the left
 *   and Plan, Evidence, Tickets and Details sit in a rail of 400 to 440 px on the right, with no
 *   Conversation tab (the chat is always there). From 1024 to 1279 px the same views are tabs
 *   above the chat area, and the chat is the first tab. Below 1024 px the chat is the whole page
 *   and the other views open as a full-screen sheet from the header. In every mode the page is
 *   one scroll container per region (the chat list, and the panel), the header and status line
 *   stay still, and nothing scrolls sideways. The view is the URL's tab segment, so links, Back
 *   and reload land on the same view in every mode.
 *
 * Exports: WorkLayout.
 * Depends on: react, components/ui/route-tabs, components/ui/tab-panel, components/work/context-sheet,
 *   types/needs-you-dock.types, types/route-tabs.types.
 */

import type { ReactNode } from 'react';
import { RouteTabs } from '#/components/ui/route-tabs.js';
import { TabPanel } from '#/components/ui/tab-panel.js';
import { ContextSheet } from '#/components/work/context-sheet.js';
import type { WorkLayoutMode } from '#/types/needs-you-dock.types.js';
import type { RouteTab, ScrollMemory } from '#/types/route-tabs.types.js';

const CHAT = 'conversation';

export function WorkLayout(props: {
  mode: WorkLayoutMode;
  header: ReactNode;
  /** One slim line under the header (offline, could not refresh); not a box. */
  status?: ReactNode;
  /** Dialogs and other things that draw outside the frame. */
  extras?: ReactNode;
  /** The conversation with its dock and composer. */
  chat: ReactNode;
  /** Every tab, the conversation first (the rail and the sheet leave it out). */
  tabs: readonly RouteTab[];
  /** The URL's tab. */
  active: string;
  /** In `rail` mode, the tab to show when the URL names the conversation. */
  railTab: string;
  /** The content of the tab being shown beside, above or over the chat. */
  panel: ReactNode;
  memory: ScrollMemory;
  /** The strip's accessible name and ids; unique per page kind. */
  idPrefix: string;
  label: string;
  /** Where the sheet's "Back to chat" goes. */
  onCloseSheet: () => void;
  /** Title of the sheet and of the rail landmark. */
  contextTitle: string;
}) {
  const { mode, active } = props;
  const sideTabs = props.tabs.filter((tab) => tab.id !== CHAT);
  const shownTab = mode === 'rail' && active === CHAT ? props.railTab : active;

  return (
    <section className="page-fill flex min-w-0 flex-col gap-2">
      {props.header}
      {props.status}
      {props.extras}

      {mode === 'rail' ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_25rem] gap-6 2xl:grid-cols-[minmax(0,1fr)_27.5rem]">
          <div className="flex min-h-0 min-w-0 flex-col">{props.chat}</div>
          <aside
            aria-label={props.contextTitle}
            className="flex min-h-0 min-w-0 flex-col border-l border-line pl-6"
          >
            <RouteTabs
              label={props.label}
              idPrefix={props.idPrefix}
              tabs={sideTabs}
              active={shownTab}
            />
            <TabPanel idPrefix={props.idPrefix} tab={shownTab} memory={props.memory}>
              {props.panel}
            </TabPanel>
          </aside>
        </div>
      ) : mode === 'tabs' ? (
        <>
          <RouteTabs
            label={props.label}
            idPrefix={props.idPrefix}
            tabs={props.tabs}
            active={active}
          />
          <TabPanel
            idPrefix={props.idPrefix}
            tab={active}
            memory={props.memory}
            scroll={active !== CHAT}
          >
            {active === CHAT ? props.chat : props.panel}
          </TabPanel>
        </>
      ) : (
        <>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{props.chat}</div>
          <ContextSheet
            open={active !== CHAT}
            onClose={props.onCloseSheet}
            title={props.contextTitle}
            tabs={
              <RouteTabs
                label={props.label}
                idPrefix={props.idPrefix}
                tabs={sideTabs}
                active={active}
              />
            }
          >
            <TabPanel idPrefix={props.idPrefix} tab={active} memory={props.memory}>
              {props.panel}
            </TabPanel>
          </ContextSheet>
        </>
      )}
    </section>
  );
}
