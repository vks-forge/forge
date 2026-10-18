/**
 * PlanSections: the fixed sections of a plan, read-only, in the order the owner reviews them.
 *
 * Why: every plan has the same structure (d-0132) so the owner always knows where to look: the
 *   goal, what is in and out of scope, the decisions the grill produced, the assumptions the
 *   Director made on its own, and the verification that shows the plan was checked against the
 *   real project (blast radius, the files it read as evidence, overlaps with other cards and
 *   tickets, decisions and rejected approaches that match, risks). A section with nothing says
 *   "None" instead of vanishing, so an empty list is a visible fact rather than a doubt about
 *   whether the plan is complete. The Tickets section is its own component, since it can be
 *   edited. All text is rendered as text; it comes from a model.
 *
 * Exports: PlanSections, PlanSection.
 * Depends on: react, react-router, components/research/outside-facts, domain/card-paths, schemas/plan (type).
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { OutsideFacts } from '#/components/research/outside-facts.js';
import { cardPath } from '#/domain/card-paths.js';
import type { PlanVersion } from '#/schemas/plan.js';

/** A titled block of the plan; `children` is its content. */
export function PlanSection(props: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-semibold">{props.title}</h3>
      {props.children}
    </section>
  );
}

function Bullets(props: { items: readonly string[]; mono?: boolean; label: string }) {
  if (props.items.length === 0) {
    return <p className="text-sm text-muted">None.</p>;
  }

  return (
    <ul aria-label={props.label} className="grid gap-1 pl-4 text-sm [&>li]:list-disc">
      {props.items.map((item, index) => (
        <li
          key={`${index}-${item}`}
          className={`min-w-0 break-words ${props.mono ? 'font-data text-xs' : ''}`}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function Sub(props: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <h4 className="text-xs font-medium text-muted">{props.title}</h4>
      {props.children}
    </div>
  );
}

/** Goal, scope, decisions, assumptions and verification (everything above the tickets). */
export function PlanBody(props: { plan: PlanVersion; slug: string }) {
  const { plan } = props;
  const v = plan.verification;

  return (
    <>
      <PlanSection title="Goal">
        <p className="min-w-0 break-words text-sm">{plan.goal || 'None.'}</p>
      </PlanSection>

      <PlanSection title="Scope and non-goals">
        <div className="grid gap-3 sm:grid-cols-2">
          <Sub title="In scope">
            <Bullets items={plan.scope} label="In scope" />
          </Sub>
          <Sub title="Not in scope">
            <Bullets items={plan.non_goals} label="Not in scope" />
          </Sub>
        </div>
      </PlanSection>

      <PlanSection title="Decisions">
        {plan.decisions.length === 0 ? (
          <p className="text-sm text-muted">None.</p>
        ) : (
          <dl className="grid gap-2 text-sm">
            {plan.decisions.map((d, index) => (
              <div key={`${index}-${d.question}`} className="grid gap-0.5">
                <dt className="min-w-0 break-words text-muted">{d.question}</dt>
                <dd className="min-w-0 break-words font-medium">{d.answer}</dd>
              </div>
            ))}
          </dl>
        )}
      </PlanSection>

      <PlanSection title="Assumptions">
        <Bullets items={plan.assumptions} label="Assumptions" />
      </PlanSection>

      <PlanSection title="Verification">
        <div className="grid gap-3 rounded-xl border border-line bg-surface p-3">
          <Sub title="Blast radius">
            <p className="min-w-0 break-words text-sm">{v.blast_radius || 'None.'}</p>
          </Sub>
          <Sub title="Files read">
            <Bullets items={v.files_read} mono label="Files read" />
          </Sub>
          <Sub title="Overlaps with other work">
            <Bullets
              label="Overlaps"
              items={v.overlaps.map(
                (o) =>
                  `${[o.card_id, o.ticket_id].filter(Boolean).join(' / ') || 'Other work'}${
                    o.files.length > 0 ? `: ${o.files.join(', ')}` : ''
                  }`,
              )}
            />
          </Sub>
          <Sub title="Matching decisions">
            <Bullets items={v.matching_decisions} label="Matching decisions" />
          </Sub>
          <Sub title="Rejected approaches it matched">
            <Bullets items={v.rejected_hits} label="Rejected approaches" />
          </Sub>
          <Sub title="Risks">
            <Bullets items={v.risks} label="Risks" />
          </Sub>
          <Sub title="Outside facts the plan rests on">
            <OutsideFacts
              slug={props.slug}
              cardId={plan.card_id}
              claims={v.outside_claims}
            />
          </Sub>
        </div>
      </PlanSection>
    </>
  );
}

export function PlanLinks(props: { slug: string; links: readonly string[] }) {
  return (
    <PlanSection title="Card links">
      {props.links.length === 0 ? (
        <p className="text-sm text-muted">None.</p>
      ) : (
        <ul aria-label="Linked cards" className="flex flex-wrap gap-2 text-sm">
          {props.links.map((id) => (
            <li key={id}>
              <Link
                to={cardPath(props.slug, id)}
                className="font-data text-signal underline"
              >
                {id}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PlanSection>
  );
}
