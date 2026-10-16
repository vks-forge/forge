/**
 * CardBody: the chat and the Plan, Tickets and Details panels, laid out for the screen width.
 *
 * Why: the card is a conversation with a plan beside it. On a wide screen the chat is the main
 *   column and the side panel (tabs Plan / Tickets / Details) sits next to it, so the owner can
 *   read the plan while answering. Below 768 px there is room for one thing at a time, so the
 *   same four views become tabs (Chat / Plan / Tickets / Details). The tab lives in the URL
 *   (`?tab=`) so a link opens the right view and Back works; on a wide screen the chat is
 *   always shown and `?tab=chat` simply leaves the panel on Plan. Exactly one layout is
 *   mounted, so nothing is rendered twice and no hidden copy takes focus.
 *
 * Exports: CardBody.
 * Depends on: react, @forge/core (type), routes/card/*, schemas/cards (type), types/*.
 */

import type { CardType } from '@forge/core';
import { CardChat } from '#/routes/card/card-chat.js';
import { CardDetails } from '#/routes/card/card-details.js';
import { CARD_TABS, CardTabs, SIDE_TABS } from '#/routes/card/card-tabs.js';
import { CardTickets } from '#/routes/card/card-tickets.js';
import { PlanTab } from '#/routes/card/plan/plan-tab.js';
import type { CardDetailReply } from '#/schemas/cards.js';
import type { CardTab } from '#/types/cards-ui.types.js';
import type { PlanDecisions } from '#/types/plan.types.js';

export function CardBody(props: {
  card: CardDetailReply;
  types: readonly CardType[] | undefined;
  tab: CardTab;
  wide: boolean;
  decisions: PlanDecisions;
  onTab: (tab: CardTab) => void;
  onSuggestClose: (reason: string) => void;
}) {
  const { card, tab, wide } = props;
  const panel: CardTab = tab === 'chat' ? 'plan' : tab;
  const shown: CardTab = wide ? panel : tab;

  const chat = (
    <CardChat
      card={card}
      types={props.types}
      onSuggestClose={props.onSuggestClose}
      onReviewPlan={() => props.onTab('plan')}
    />
  );

  const tabs = (
    <CardTabs
      label={wide ? 'Card panel' : 'Card'}
      tabs={wide ? SIDE_TABS : CARD_TABS}
      tab={shown}
      ticketCount={card.tickets.length}
      needsYou={card.tickets.some((t) => t.needs_you)}
      planReady={card.phase === 'plan_ready'}
      onChange={props.onTab}
    />
  );

  const view = (
    <div id="card-panel" role="tabpanel" aria-labelledby={`card-tab-${shown}`}>
      {shown === 'chat' ? chat : null}
      {shown === 'plan' ? <PlanTab card={card} decisions={props.decisions} /> : null}
      {shown === 'tickets' ? (
        <CardTickets slug={card.project} tickets={card.tickets} />
      ) : null}
      {shown === 'details' ? <CardDetails card={card} /> : null}
    </div>
  );

  if (!wide) {
    return (
      <div className="grid gap-4">
        {tabs}
        {view}
      </div>
    );
  }

  return (
    <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
      <div className="min-w-0">{chat}</div>
      <aside
        aria-label="Plan, tickets and details"
        className="grid min-w-0 gap-4 md:sticky md:top-4 md:max-h-[calc(100dvh-2rem)] md:overflow-y-auto md:pr-1"
      >
        {tabs}
        {view}
      </aside>
    </div>
  );
}
