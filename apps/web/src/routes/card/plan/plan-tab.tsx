/**
 * PlanTab: the card's plan, its versions and the owner's decision on it.
 *
 * Why: when the grill ends the Director writes the plan here (d-0132), and this tab is where the
 *   owner turns it into tickets or sends it back. It shows the newest version by default, lets
 *   the owner open an older one (read-only, with a notice, so nobody approves a version that is
 *   no longer current), and can show what changed since the version before. The decision buttons
 *   exist only when the card is waiting for one (phase `plan_ready`), on the newest version, on
 *   an open card; at any other time the plan is a record. A card with no plan says so and what
 *   brings one. The floor result is stated plainly (pass, or the reasons) while the plan is open to a
 *   decision; once approved the server freezes it (`floor: null`, `floor_frozen_at`), the banner goes and one muted line says it was
 *   checked at approval, so a done card never reads "Safety minimum not met" because of its own merges. A refused
 *   decision is shown right under the buttons.
 *
 * Exports: PlanTab.
 * Depends on: react, api/use-plan, routes/card/plan/plan-impact, components/ui/*, routes/card/plan/*, domain/plan-diff,
 *   schemas/cards (type), types/plan.types.
 */

import { CircleAlert, CircleCheck, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { usePlan, usePlanVersion } from '#/api/use-plan.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { Button } from '#/components/ui/button.js';
import { Picker } from '#/components/ui/picker.js';
import { formatWhen } from '#/domain/format-time.js';
import { diffPlans, diffRowsOf } from '#/domain/plan-diff.js';
import { outsideFactsBanner } from '#/domain/research-copy.js';
import { PlanDiffView } from '#/routes/card/plan/plan-diff-view.js';
import { PlanImpact } from '#/routes/card/plan/plan-impact.js';
import { PlanBody, PlanLinks } from '#/routes/card/plan/plan-sections.js';
import { PlanTickets } from '#/routes/card/plan/plan-tickets.js';
import type { CardDetailReply } from '#/schemas/cards.js';
import type { FloorResult, PlanVersion } from '#/schemas/plan.js';
import type { PlanDecisions } from '#/types/plan.types.js';
import { EmptyState } from '#/components/ui/empty-state.js';
import { WhatsThis } from '#/components/ui/whats-this.js';

function Floor(props: { floor: FloorResult; unverified: number }) {
  const { floor } = props;
  const banner = outsideFactsBanner(props.unverified);
  const Icon = floor.pass ? CircleCheck : CircleAlert;

  return (
    <div className="grid gap-1 rounded-xl border border-line bg-surface p-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <Icon
          aria-hidden="true"
          className={`size-4 shrink-0 ${floor.pass ? 'text-good' : 'text-attn'}`}
        />
        {floor.pass ? 'Safety minimum met' : 'Safety minimum not met'}
        <WhatsThis term="safety_minimum" />
      </p>
      {banner !== null && !floor.pass ? (
        <p className="pl-6 text-xs font-medium">{banner}</p>
      ) : null}
      {floor.reasons.length > 0 ? (
        <ul
          aria-label="Floor reasons"
          className="grid gap-0.5 pl-6 text-xs [&>li]:list-disc"
        >
          {floor.reasons.map((reason, index) => (
            <li key={`${index}-${reason}`} className="min-w-0 break-words">
              {reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Rows to show for `plan` against its previous version, from the server's record or a fresh comparison. */
function useDiff(cardId: string, plan: PlanVersion | undefined, enabled: boolean) {
  const previous = plan && plan.version > 1 ? plan.version - 1 : null;
  const before = usePlanVersion(
    cardId,
    enabled && plan?.diff_from_previous === undefined ? previous : null,
  );

  if (!plan || previous === null) {
    return null;
  }

  if (plan.diff_from_previous !== undefined) {
    return diffRowsOf(plan.diff_from_previous);
  }

  return before.data ? diffPlans(before.data.plan, plan) : null;
}

export function PlanTab(props: { card: CardDetailReply; decisions: PlanDecisions }) {
  const { card, decisions } = props;
  const plan = usePlan(card.id);
  const [picked, setPicked] = useState<number | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const current = plan.data?.current ?? null;
  const viewing = picked !== null && picked !== current?.version ? picked : null;
  const older = usePlanVersion(card.id, viewing);
  const shown = viewing === null ? current : (older.data?.plan ?? null);
  const rows = useDiff(card.id, shown ?? undefined, showDiff);

  if (plan.isPending) {
    return <StatePanel kind="loading" label="Loading the plan" />;
  }

  const missing = plan.error instanceof ApiError && plan.error.status === 404;
  if (plan.isError && !plan.data && !missing) {
    const { title, detail } = describeError(plan.error);

    return (
      <StatePanel
        kind="error"
        title={title}
        detail={detail}
        onRetry={() => void plan.refetch()}
        retrying={plan.isFetching}
      />
    );
  }

  if (current === null) {
    return (
      <EmptyState icon={ScrollText} title="No plan yet">
        The Director writes one into this tab when the questions are answered
        {card.phase === 'grilling'
          ? '; answer them in the chat, or choose "Enough, write the plan".'
          : '.'}
      </EmptyState>
    );
  }

  const versions = plan.data?.versions ?? [];
  const latest = current.version;
  const canDecide =
    card.phase === 'plan_ready' && card.closed_reason === undefined && viewing === null;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-40">
          <Picker
            label="Plan version"
            size="sm"
            value={String(shown?.version ?? latest)}
            items={[...new Set([...versions.map((v) => v.version), latest])]
              .sort((a, b) => b - a)
              .map((v) => ({
                value: String(v),
                label: v === latest ? `v${v} (latest)` : `v${v}`,
              }))}
            onChange={(value) => {
              setPicked(Number(value));
              setShowDiff(false);
            }}
          />
        </div>
        {shown && shown.version > 1 ? (
          <Button aria-pressed={showDiff} onClick={() => setShowDiff((value) => !value)}>
            {showDiff ? 'Hide changes' : `Show changes since v${shown.version - 1}`}
          </Button>
        ) : null}
      </div>

      {viewing !== null ? (
        <p role="status" className="rounded-xl bg-hover p-3 text-sm">
          This is an older version, shown read-only. The latest is v{latest}.
        </p>
      ) : null}

      {viewing === null && plan.data?.floor ? (
        <Floor
          floor={plan.data.floor}
          unverified={
            current.verification.outside_claims.filter((c) => c.status === 'unverified')
              .length
          }
        />
      ) : null}

      {viewing === null &&
      plan.data?.floor === null &&
      plan.data.floor_frozen_at !== null ? (
        <p className="text-sm text-muted">
          The safety minimum was checked when this plan was approved (
          {formatWhen(plan.data.floor_frozen_at)}). It is not re-checked against the
          card&apos;s own merges.
        </p>
      ) : null}

      {viewing === null && canDecide ? (
        <PlanImpact
          willCancel={plan.data?.will_cancel ?? []}
          notCovered={plan.data?.not_covered ?? []}
          alreadyExists={plan.data?.already_exists ?? []}
        />
      ) : null}

      {showDiff && shown && shown.version > 1 ? (
        rows === null ? (
          <p role="status" className="text-sm text-muted">
            Loading the earlier version…
          </p>
        ) : (
          <PlanDiffView since={shown.version - 1} rows={rows} />
        )
      ) : null}

      {shown === null ? (
        older.isError ? (
          <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm">
            That version did not load. {describeError(older.error).detail}
          </p>
        ) : (
          <StatePanel kind="loading" label="Loading that version" />
        )
      ) : (
        <>
          <PlanBody plan={shown} slug={card.project} />
          <PlanTickets cardId={card.id} plan={shown} editable={canDecide} />
          <PlanLinks slug={card.project} links={shown.card_links} />
        </>
      )}

      {canDecide || decisions.error !== null ? (
        <div className="sticky bottom-0 -mx-1 grid gap-2 border-t border-line bg-bg px-1 py-3">
          {canDecide ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => decisions.open('approve')}>
                Approve plan
              </Button>
              <Button onClick={() => decisions.open('changes')}>Request changes</Button>
            </div>
          ) : null}
          {decisions.error !== null ? (
            <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm">
              {decisions.error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
