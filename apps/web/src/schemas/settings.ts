/**
 * Response and form schemas of the Forge settings endpoints.
 *
 * Why: the Harnesses, GitHub, Limits and General screens act on credentials, concurrency caps
 *   and tool approvals, so a server and UI that disagree must fail at the boundary with a
 *   named field, never as a half-rendered form. Response shapes are built from `@forge/core`
 *   schemas (Harness, CompatReport, ForgeConfig, ConfigVersion, GithubConnection) so a field
 *   added there reaches the UI; only the envelopes apps/server adds around them (routes
 *   `harnesses.ts`, `github-connections.ts`, `settings.ts`) are written here. The form
 *   schemas mirror the server's request bodies (`schemas/api.ts`) so a mistake is caught
 *   inline before a round trip; the server stays the authority and re-checks every body.
 *
 * Exports: HarnessView, HarnessesResponse, HarnessTestResult, SecretStored, CompatJob,
 *   CompatView, ToolsView, ConnectionsResponse, ConnectionReply, CompanyView, HistoryResponse,
 *   SecretForm, ConnectionForm, DecisionForm, SaveMetaForm (schemas and inferred types).
 * Depends on: @forge/core, schemas/director-config, zod.
 */

import {
  CompatReport,
  ConfigVersion,
  GithubConnection,
  Harness,
  HarnessSecretKind,
  HarnessState,
  HarnessToolSchema,
} from '@forge/core';
import { z } from 'zod';
import { CompanyConfigReply } from '#/schemas/director-config.js';

/** `GET /harnesses` row: the stored harness plus whether each credential kind is stored (never the credential). */
export const HarnessView = Harness.extend({
  paused_until: z.iso.datetime().optional(),
  pause_reason: z.string().optional(),
  secrets: z.object({ api_key: z.boolean(), oauth_token: z.boolean() }),
});
export type HarnessView = z.infer<typeof HarnessView>;

export const HarnessesResponse = z.object({
  harnesses: z.array(HarnessView),
  paused: z.array(HarnessState),
});
export type HarnessesResponse = z.infer<typeof HarnessesResponse>;

/** `POST /harnesses/:id/test`. */
export const HarnessTestResult = z.object({
  binary_path: z.string().optional(),
  version: z.string().optional(),
  auth_mode: z.string(),
  ok: z.boolean(),
  account_kind: z.string().optional(),
  live: z.enum(['skipped', 'ok', 'failed']),
  error: z.string().optional(),
  live_note: z.string().optional(),
});
export type HarnessTestResult = z.infer<typeof HarnessTestResult>;

/** `PUT /harnesses/:id/secret` answer: that a credential is now stored, never its value. */
export const SecretStored = z.object({
  id: z.string(),
  kind: HarnessSecretKind,
  stored: z.literal(true),
});
export type SecretStored = z.infer<typeof SecretStored>;

/** The background compatibility check (`CompatJobState` in @forge/drivers). */
export const CompatJob = z.object({
  state: z.enum(['idle', 'running', 'done', 'failed']),
  version: z.string().optional(),
  started_at: z.string().optional(),
  finished_at: z.string().optional(),
  error: z.string().optional(),
  report: CompatReport.optional(),
});
export type CompatJob = z.infer<typeof CompatJob>;

/** `GET /harnesses/:id/compat`. */
export const CompatView = z.object({
  version: z.string().nullable(),
  compat: z.enum(['pass', 'fail', 'pending', 'unknown']),
  report: CompatReport.nullable(),
  checked_at: z.string().nullable(),
  job: CompatJob,
});
export type CompatView = z.infer<typeof CompatView>;

/** `GET /harnesses/:id/tools`. */
export const ToolsView = z.object({
  version: z.string().nullable(),
  tools: z.array(HarnessToolSchema),
});
export type ToolsView = z.infer<typeof ToolsView>;

export const ConnectionsResponse = z.object({ connections: z.array(GithubConnection) });
export type ConnectionsResponse = z.infer<typeof ConnectionsResponse>;

export const ConnectionReply = z.object({ connection: GithubConnection });
export type ConnectionReply = z.infer<typeof ConnectionReply>;

/**
 * `GET /settings/company`: the effective settings and the latest saved version (0 = built-ins).
 * An older server without a `director` section is filled with stand-ins and flagged.
 */
export const CompanyView = CompanyConfigReply;
export type CompanyView = z.infer<typeof CompanyView>;

export const HistoryResponse = z.object({ versions: z.array(ConfigVersion) });
export type HistoryResponse = z.infer<typeof HistoryResponse>;

/** A pasted API key or OAuth token: one token, no spaces (mirrors the server's `HarnessSecretBody`). */
export const SecretForm = z.object({
  value: z
    .string()
    .min(1, 'Paste the key or token first.')
    .max(4096, 'That is too long to be a key or token.')
    .regex(/^\S+$/, 'A key or token has no spaces or line breaks.'),
});

/** Add a GitHub App connection (mirrors the server's `ConnectionCreateBody`). */
export const ConnectionForm = z.object({
  account: z.string().trim().min(1, 'Enter the GitHub account or organisation.'),
  app_id: z.string().regex(/^[0-9]+$/, 'The App ID is a number.'),
  app_slug: z.string().trim(),
  private_key_pem: z
    .string()
    .refine(
      (pem) => /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(pem) && pem.includes('-----END'),
      'Paste the whole .pem file, from the BEGIN line to the END line.',
    ),
});
export type ConnectionForm = z.infer<typeof ConnectionForm>;

/** Who decides a tool schema or saves a settings version, and why (mirrors `ToolDecisionBody` and `SettingsPutBody`). */
export const DecisionForm = z.object({
  author: z.string().trim().min(1, 'Say who is deciding.'),
  reason: z.string().trim().min(1, 'Give a short reason; it is kept in the record.'),
});
export type DecisionForm = z.infer<typeof DecisionForm>;
