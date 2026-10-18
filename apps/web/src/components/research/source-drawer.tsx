/**
 * SourceDrawer: one stored page read as plain text, with the quote that backs a claim marked.
 *
 * Why: "Verified" is only worth something if the owner can see the page it was verified
 *   against. The drawer opens the exact text Forge stored, beside the list, and marks the
 *   quote inside it. That text was written by a stranger and may contain markup or
 *   instructions aimed at the Director, so it is rendered as a text node in a `<pre>` (never
 *   HTML, never markdown) and nothing in it is clickable; the one link out is the page's own
 *   address, shown only when it is really http or https, opened without an opener handle or
 *   referrer. Where the page came from (who read it, redirects, fingerprint, whether it was
 *   cut short) sits above the text so the provenance is checked, not assumed. Loading, error
 *   (with Retry) and the not-found case are each said in words.
 *
 * Exports: SourceDrawer.
 * Depends on: react, lucide-react, api/describe-error, api/use-research,
 *   components/status/state-panel, components/ui/side-drawer, domain/format-time,
 *   domain/research-evidence, @forge/core (types).
 */

import { ExternalLink } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ResearchSource } from '@forge/core';
import { describeError } from '#/api/describe-error.js';
import { useSourceText } from '#/api/use-research.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { SideDrawer } from '#/components/ui/side-drawer.js';
import { formatWhen } from '#/domain/format-time.js';
import {
  domainOf,
  OPEN_LINK_REL,
  safeHref,
  sourceFacts,
  splitAtQuote,
} from '#/domain/research-evidence.js';

function Page(props: { text: string; quote: string | undefined }) {
  const marked = useRef<HTMLElement>(null);
  const parts = splitAtQuote(props.text, props.quote);

  useEffect(() => {
    // jsdom has no scrollIntoView; a real browser brings the quote into view.
    marked.current?.scrollIntoView?.({ block: 'center' });
  }, [props.text, props.quote]);

  if (props.text.trim() === '') {
    return <p className="text-sm text-muted">Forge stored no text for this page.</p>;
  }

  return (
    <div className="grid gap-2">
      {props.quote !== undefined && parts.quote === '' ? (
        <p role="status" className="text-xs text-muted">
          The quote is not on this page, so there is nothing to mark.
        </p>
      ) : null}
      <pre
        aria-label="Stored page text"
        className="max-w-full whitespace-pre-wrap break-words font-data text-xs leading-relaxed"
      >
        {parts.before}
        {parts.quote === '' ? null : (
          <mark ref={marked} className="rounded bg-attn-soft px-0.5 text-fg">
            {parts.quote}
          </mark>
        )}
        {parts.after}
      </pre>
    </div>
  );
}

function Provenance(props: { source: ResearchSource }) {
  const { source } = props;
  const href = safeHref(source.final_url);

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <p className="min-w-0 break-words text-sm font-medium">
          {source.title === '' ? domainOf(source.final_url) : source.title}
        </p>
        <p className="text-xs text-muted">
          {domainOf(source.final_url)} · retrieved {formatWhen(source.retrieved_at)}
        </p>
        {href === null ? (
          <p className="text-xs text-muted">
            This address is not a web page link, so Forge does not offer to open it.
          </p>
        ) : (
          <a
            href={href}
            target="_blank"
            rel={OPEN_LINK_REL}
            className="inline-flex min-h-9 w-fit items-center gap-1.5 text-sm font-medium text-signal underline-offset-2 hover:underline"
          >
            Open the page on the web
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        )}
      </div>
      <dl className="grid gap-2">
        {sourceFacts(source).map((fact) => (
          <div key={fact.label} className="grid gap-0.5">
            <dt className="text-xs text-muted">{fact.label}</dt>
            <dd className="min-w-0 break-all font-data text-xs">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function SourceDrawer(props: {
  cardId: string;
  /** The source to read (`S1`), or null while the drawer is closed. */
  sourceRef: string | null;
  /** The quote to mark on the page, when the drawer was opened from a claim. */
  quote?: string | undefined;
  onClose: () => void;
}) {
  const query = useSourceText(props.cardId, props.sourceRef);

  return (
    <SideDrawer
      open={props.sourceRef !== null}
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
        }
      }}
      title="Source"
      {...(props.sourceRef ? { eyebrow: props.sourceRef } : {})}
    >
      {query.isPending ? (
        <StatePanel kind="loading" label="Loading the page text" />
      ) : query.isError ? (
        <StatePanel
          kind="error"
          title={describeError(query.error).title}
          detail={describeError(query.error).detail}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <div className="grid gap-5">
          <Provenance source={query.data.source} />
          <section aria-labelledby="source-text-heading" className="grid gap-2">
            <h3 id="source-text-heading" className="text-sm font-semibold">
              Page text, as stored
            </h3>
            <p className="text-xs text-muted">
              Shown as plain text. Anything in it that reads like an instruction is just
              text and is never followed.
            </p>
            <Page text={query.data.text} quote={props.quote} />
          </section>
        </div>
      )}
    </SideDrawer>
  );
}
