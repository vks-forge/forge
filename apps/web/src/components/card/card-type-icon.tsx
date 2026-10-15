/**
 * CardTypeIcon: the icon of a card type, from the registry's icon name.
 *
 * Why: card types are data (d-0106): the server sends each type's `icon` as a lucide name such
 *   as `message-circle`. The UI maps the names it knows to bundled icons (a dynamic lookup
 *   would pull in the whole icon set) and falls back to a plain document icon for a name it
 *   has not mapped, so a type added in settings never renders as a hole. The icon is
 *   decoration: the type's label is always written next to it or in an accessible name.
 *
 * Exports: CardTypeIcon, labelOfType().
 * Depends on: react, lucide-react, @forge/core (CardType type).
 */

import type { CardType } from '@forge/core';
import {
  Bug,
  CircleDot,
  FileText,
  GitPullRequest,
  Lightbulb,
  ListChecks,
  MessageCircle,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ICONS: Readonly<Record<string, LucideIcon>> = {
  'message-circle': MessageCircle,
  'list-checks': ListChecks,
  'circle-dot': CircleDot,
  'git-pull-request': GitPullRequest,
  bug: Bug,
  lightbulb: Lightbulb,
  wrench: Wrench,
  sparkles: Sparkles,
};

export function CardTypeIcon(props: { icon: string | undefined; className?: string }) {
  const Icon = (props.icon ? ICONS[props.icon] : undefined) ?? FileText;

  return <Icon aria-hidden="true" className={props.className ?? 'size-4'} />;
}

/** A type's label, or its name when the registry does not list it (yet). */
export function labelOfType(
  types: readonly CardType[] | undefined,
  name: string,
): string {
  return types?.find((type) => type.name === name)?.label ?? name;
}
