/**
 * SettingsPage and SettingsSection: the frame every Forge settings screen shares.
 *
 * Why: Harnesses, GitHub, Limits and General are used for rare, careful changes, so they must
 *   read the same way: a hero header that says where you are, what this is and what state it
 *   is in, then sections as cards whose button always sits in the same footer corner. One
 *   column from a phone to a wide window means heading and controls share a left edge, so
 *   nothing misaligns. The page also sets the browser tab title so a user with several tabs
 *   can tell them apart.
 *
 * Exports: SettingsPage, SettingsSection.
 * Depends on: react, lucide-react, components/settings/detail-header,
 *   components/settings/section-nav, components/settings/settings-card, types/settings-ui.types.
 */

import { Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { DetailHeader } from '#/components/settings/detail-header.js';
import { SectionNav } from '#/components/settings/section-nav.js';
import { SettingsCard } from '#/components/settings/settings-card.js';
import type { Crumb, HeroBadge, HeroFact, HeroTab } from '#/types/settings-ui.types.js';

export function SettingsPage(props: {
  title: string;
  intro: string;
  icon?: LucideIcon;
  /** Defaults to "Settings / <title>". */
  crumbs?: readonly Crumb[];
  chip?: string;
  badge?: HeroBadge;
  facts?: readonly HeroFact[];
  tabs?: readonly HeroTab[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { title } = props;

  useEffect(() => {
    document.title = `${title} · Forge settings · Forge`;
  }, [title]);

  return (
    <section className="grid gap-8 pb-16">
      <DetailHeader
        crumbs={
          props.crumbs ?? [{ label: 'Settings', to: '/settings' }, { label: title }]
        }
        icon={props.icon ?? Settings}
        title={title}
        chip={props.chip}
        badge={props.badge}
        description={props.intro}
        actions={props.actions}
        facts={props.facts}
      />
      {props.tabs && props.tabs.length > 1 ? (
        <SectionNav tabs={props.tabs} />
      ) : (
        <div className="-mt-3 border-b border-line" />
      )}
      {props.children}
    </section>
  );
}

export function SettingsSection(props: {
  title: string;
  description?: ReactNode;
  id?: string;
  children: ReactNode;
}) {
  return <SettingsCard {...props} />;
}
