/**
 * Ports and option shapes of the Forge settings resources.
 *
 * Why: the Harnesses, GitHub, Limits and General screens read and change things that matter
 *   (a login, a credential, a concurrency cap), so each call a screen can make is named here
 *   once. The http adapter maps them to the server routes, so a screen is written once against
 *   these interfaces.
 *
 * Exports: HarnessesApi, GithubApi, SettingsApi, HarnessSetupBody, SecretBody, ConnectionBody,
 *   DecisionBody, SettingsSaveBody, ToolDecision, DraftSettings.
 * Depends on: @forge/core (types), schemas/settings (types), types/api.types. Types only.
 */

import type {
  ConfigVersion,
  ForgeConfig,
  GithubConnection,
  HarnessAuthMode,
  HarnessKind,
  HarnessSecretKind,
  HarnessToolSchema,
  ResearchTestBody,
  ResearchTestReply,
} from '@forge/core';
import type {
  CompanyView,
  CompatJob,
  CompatView,
  HarnessesResponse,
  HarnessTestResult,
  HarnessView,
  SecretStored,
  SetupCacheClearReply,
  SetupCacheView,
  ToolsView,
} from '#/schemas/settings.js';
import type { RequestOptions } from '#/types/api.types.js';

export interface HarnessSetupBody {
  readonly kind: HarnessKind;
  readonly binary_path?: string;
  readonly auth_mode: HarnessAuthMode;
  readonly bypass_permissions?: boolean;
}

export interface SecretBody {
  readonly kind: HarnessSecretKind;
  /** Written once; the server never returns it. */
  readonly value: string;
}

export interface ConnectionBody {
  readonly account: string;
  readonly app_id: string;
  readonly app_slug?: string;
  /** Written once to the server's secret store; never shown again. */
  readonly private_key_pem: string;
}

export interface DecisionBody {
  readonly author: string;
  readonly reason: string;
}

export type ToolDecision = 'approve' | 'deny';

export interface HarnessesApi {
  list(options?: RequestOptions): Promise<HarnessesResponse>;
  save(id: string, body: HarnessSetupBody): Promise<HarnessView>;
  putSecret(id: string, body: SecretBody): Promise<SecretStored>;
  /** `live` makes one real model call (costs a little); off by default. */
  test(id: string, live: boolean): Promise<HarnessTestResult>;
  compat(id: string, options?: RequestOptions): Promise<CompatView>;
  runCompat(id: string): Promise<CompatJob>;
  tools(id: string, options?: RequestOptions): Promise<ToolsView>;
  decideTool(
    id: string,
    tool: string,
    decision: ToolDecision,
    body: DecisionBody,
  ): Promise<HarnessToolSchema>;
}

export interface GithubApi {
  list(options?: RequestOptions): Promise<readonly GithubConnection[]>;
  add(body: ConnectionBody): Promise<GithubConnection>;
}

/** What `PUT /settings/company` takes: an override document and the version the editor saw. */
export interface SettingsSaveBody {
  readonly doc: Readonly<Record<string, unknown>>;
  readonly author: string;
  readonly reason: string;
  readonly expectedVersion: number;
}

export interface SettingsApi {
  company(options?: RequestOptions): Promise<CompanyView>;
  saveCompany(body: SettingsSaveBody): Promise<ConfigVersion>;
  /** Every saved version, oldest first. */
  companyHistory(options?: RequestOptions): Promise<readonly ConfigVersion[]>;
  /** Tries the search provider (with the given unsaved settings, or the saved ones); nothing is saved. */
  testResearch(body: ResearchTestBody): Promise<ResearchTestReply>;
  /** How much disk the setup cache uses; the server may answer from a measurement up to a minute old. */
  setupCache(options?: RequestOptions): Promise<SetupCacheView>;
  /** Empties the copied install folders, and the shared downloads too when asked. */
  clearSetupCache(body: { include_downloads: boolean }): Promise<SetupCacheClearReply>;
}

/** An edit in progress: the settings being changed, as they were when loaded, and the version they came from. */
export interface DraftSettings {
  readonly config: ForgeConfig;
  readonly base: ForgeConfig;
  readonly version: number;
}
