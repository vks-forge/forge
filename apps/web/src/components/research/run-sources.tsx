/**
 * RunSources: the web pages one Worker run read, with where each came from.
 *
 * Why: a Worker may fetch pages while it works, and a reviewer's finding may cite one of
 *   them. When the owner doubts a result, "what did it read?" is the first question, so the
 *   Runs list and the run drawer answer it: each page as domain, title, when it was read, how
 *   large it was and whether the stored text was cut short, with a link out to the page itself.
 *   Titles and addresses are page-supplied, so they are text; the link is offered only for a
 *   real http or https address and opens without an opener handle or referrer. Nothing is
 *   loaded until the owner asks (`enabled`), since most runs read nothing.
 *
 * Exports: RunSources.
 * Depends on: api/use-research, api/describe-error, components/status/state-panel,
 *   domain/format-bytes, domain/format-time, domain/research-evidence.
 */

import { describeError } from '#/api/describe-error.js';
import { useRunSources } from '#/api/use-research.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { formatBytes } from '#/domain/format-bytes.js';
import { formatWhen } from '#/domain/format-time.js';
import { domainOf, OPEN_LINK_REL, safeHref } from '#/domain/research-evidence.js';

export function RunSources(props: { runId: string; enabled?: boolean }) {
  const query = useRunSources(props.enabled === false ? null : props.runId);

  if (query.isPending) {
    return <StatePanel kind="loading" label="Loading the pages this run read" />;
  }

  if (query.isError && !query.data) {
    return (
      <StatePanel
        kind="error"
        title={describeError(query.error).title}
        detail={describeError(query.error).detail}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const { sources } = query.data;

  if (sources.length === 0) {
    return <p className="text-sm text-muted">This run read no web pages.</p>;
  }

  return (
    <ul aria-label="Pages this run read" className="grid">
      {sources.map((source) => {
        const href = safeHref(source.final_url);
        const title = source.title === '' ? domainOf(source.final_url) : source.title;

        return (
          <li
            key={source.id}
            className="grid gap-0.5 border-b border-line py-2 text-sm last:border-b-0"
          >
            <span className="min-w-0 break-words">
              <span className="font-medium">{domainOf(source.final_url)}</span>{' '}
              <span className="text-muted">{title}</span>
            </span>
            <span className="text-xs text-muted">
              read {formatWhen(source.retrieved_at)} · {formatBytes(source.bytes)}
              {source.truncated ? ' · cut short' : ''}
            </span>
            {href === null ? (
              <span className="min-w-0 break-all font-data text-xs">{source.final_url}</span>
            ) : (
              <a
                href={href}
                target="_blank"
                rel={OPEN_LINK_REL}
                className="min-w-0 break-all font-data text-xs text-signal underline-offset-2 hover:underline"
              >
                {href}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
