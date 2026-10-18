/**
 * Forge settings, Research: which search provider the Director and Workers use and what they
 * may fetch.
 *
 * Why: research is the one place Forge reaches onto the open web (d-0144), so what it may
 *   reach is the owner's to set, not a hand-edited file. The provider is SearXNG on this
 *   machine by default, or Off; the address says where it listens; host lists narrow which
 *   pages may be read (an allow list, when set, is the only place; a deny list is never); the
 *   timeout bounds a slow page. The owner can try the provider before saving. Edits are saved
 *   as a new version with the author and a reason like every company setting, and a project
 *   can only narrow what is set here (its Research tab). How much the Director may research
 *   per card is on the Director page, so this page says so.
 *
 * Exports: ResearchPage.
 * Depends on: lucide-react, react-router, components/research/*, components/settings/*,
 *   components/ui/picker, domain/research-copy, domain/research-settings-fields, domain/nav-entries.
 */

import { Telescope } from 'lucide-react';
import { Link } from 'react-router';
import { HostsField } from '#/components/research/hosts-field.js';
import { ProviderTest } from '#/components/research/provider-test.js';
import { CompanyScreen } from '#/components/settings/company-screen.js';
import { ConfigFields } from '#/components/settings/config-fields.js';
import { SettingsSection } from '#/components/settings/settings-page.js';
import { Picker } from '#/components/ui/picker.js';
import { settingsPath } from '#/domain/nav-entries.js';
import { PROVIDER_ITEMS } from '#/domain/research-copy.js';
import {
  firstErrorUnder,
  RESEARCH_FETCH_FIELDS,
  RESEARCH_URL_FIELD,
} from '#/domain/research-settings-fields.js';

export function ResearchPage() {
  return (
    <CompanyScreen
      title="Research"
      icon={Telescope}
      intro="Where the Director and Workers look facts up on the web, and which pages they may read. Pages are read as data, never as instructions. Changes apply to the next research run."
    >
      {(draft, config) => {
        const research = config.research;
        const set = (path: string, value: unknown): void => draft.setField(path, value);
        const off = research.provider === 'none';
        const blocked = firstErrorUnder(draft.errors, 'research') !== undefined;

        return (
          <>
            <SettingsSection
              id="provider"
              title="Search provider"
              description="What answers a search. With Off, the Director says it could not look anything up and the plan goes to you without outside facts."
            >
              <div className="grid max-w-xl gap-1.5">
                <p id="research-provider-label" className="text-sm font-medium">
                  Provider
                </p>
                <Picker
                  aria-labelledby="research-provider-label"
                  items={PROVIDER_ITEMS}
                  value={research.provider}
                  onChange={(value) =>
                    set('research.provider', value === 'none' ? 'none' : 'searxng')
                  }
                />
              </div>
              {off ? (
                <p className="max-w-xl text-sm text-muted">
                  Research is off. The address and host fields below are kept but not
                  used.
                </p>
              ) : null}
              <ConfigFields
                fields={RESEARCH_URL_FIELD}
                config={config}
                errors={draft.errors}
                onChange={set}
              />
              <HostsField
                id="research-searxng-hosts"
                label="Other hosts allowed for SearXNG"
                hint="One host per line. An address on this machine is always allowed; any other host must be listed here."
                value={research.searxng.allow_hosts}
                error={firstErrorUnder(draft.errors, 'research.searxng.allow_hosts')}
                placeholder="search.example.org"
                onChange={(hosts) => set('research.searxng.allow_hosts', hosts)}
              />
              <ProviderTest settings={research} blocked={blocked} />
            </SettingsSection>

            <SettingsSection
              id="fetch"
              title="Pages that may be read"
              description="Applies to every page the Director or a Worker fetches. A project can only narrow these lists."
            >
              <HostsField
                id="research-fetch-allow"
                label="Only read these hosts"
                hint="One host per line. Leave empty to allow any public host that is not denied."
                value={research.fetch.allow_hosts}
                error={firstErrorUnder(draft.errors, 'research.fetch.allow_hosts')}
                placeholder="docs.example.com"
                onChange={(hosts) => set('research.fetch.allow_hosts', hosts)}
              />
              <HostsField
                id="research-fetch-deny"
                label="Never read these hosts"
                hint="One host per line. A denied host stays denied even if it is also allowed above."
                value={research.fetch.deny_hosts}
                error={firstErrorUnder(draft.errors, 'research.fetch.deny_hosts')}
                placeholder="example.net"
                onChange={(hosts) => set('research.fetch.deny_hosts', hosts)}
              />
              <ConfigFields
                fields={RESEARCH_FETCH_FIELDS}
                config={config}
                errors={draft.errors}
                onChange={set}
              />
            </SettingsSection>

            <p className="max-w-prose text-sm text-muted">
              How many searches and pages one card may use is set on the{' '}
              <Link to={settingsPath('director')} className="underline">
                Director page
              </Link>
              , under Research limits.
            </p>
          </>
        );
      }}
    </CompanyScreen>
  );
}
