/**
 * MarkdownText: draws a Worker message's markdown as plain React elements.
 *
 * Why: Workers format their messages (bold labels, bullets, backticked paths, code blocks)
 *   and the owner reads them far faster rendered. The text is untrusted model output, so it
 *   is drawn only from the parser's closed node set (no HTML injection, links limited to
 *   http and https) and every level wraps long unbroken strings so a path or hash can never
 *   push the thread wider than its column.
 *
 * Exports: MarkdownText.
 * Depends on: react, domain/markdown, types/markdown.types.
 */

import type { ReactNode } from 'react';
import { parseMarkdown } from '#/domain/markdown.js';
import type { MarkdownBlock, MarkdownInline } from '#/types/markdown.types.js';

const HEADING_CLASS: Readonly<Record<1 | 2 | 3, string>> = {
  1: 'text-base font-semibold',
  2: 'text-sm font-semibold',
  3: 'text-sm font-medium',
};

function Inline(props: { nodes: readonly MarkdownInline[] }): ReactNode {
  return props.nodes.map((node, index) => {
    switch (node.kind) {
      case 'text':
        return node.text;
      case 'bold':
        return (
          <strong key={index} className="font-semibold">
            <Inline nodes={node.children} />
          </strong>
        );
      case 'italic':
        return (
          <em key={index}>
            <Inline nodes={node.children} />
          </em>
        );
      case 'code':
        return (
          <code key={index} className="rounded bg-surface px-1 font-data text-xs">
            {node.text}
          </code>
        );
      case 'link':
        return (
          <a
            key={index}
            href={node.href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-signal underline"
          >
            <Inline nodes={node.children} />
          </a>
        );
    }
  });
}

function Block(props: { block: MarkdownBlock }): ReactNode {
  const { block } = props;

  switch (block.kind) {
    case 'paragraph':
      return (
        <p className="whitespace-pre-wrap">
          <Inline nodes={block.children} />
        </p>
      );
    case 'heading': {
      const Tag = `h${block.level + 2}` as 'h3' | 'h4' | 'h5';

      return (
        <Tag className={HEADING_CLASS[block.level]}>
          <Inline nodes={block.children} />
        </Tag>
      );
    }

    case 'list': {
      const List = block.ordered ? 'ol' : 'ul';

      return (
        <List
          className={`grid grid-cols-[minmax(0,1fr)] gap-0.5 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'}`}
        >
          {block.items.map((item, index) => (
            <li key={index} className="min-w-0 pl-0.5">
              <Inline nodes={item} />
            </li>
          ))}
        </List>
      );
    }

    case 'code':
      return (
        <pre className="max-w-full overflow-auto rounded-lg bg-surface p-2 font-data text-xs">
          {block.text}
        </pre>
      );
  }
}

export function MarkdownText(props: { text: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 break-words text-sm [overflow-wrap:anywhere]">
      {parseMarkdown(props.text).map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}
