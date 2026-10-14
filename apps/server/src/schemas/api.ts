/**
 * Request bodies and query parameters of the HTTP API.
 *
 * Why: every byte that arrives over HTTP is untrusted until a schema has parsed it
 *   (code.md rule 4). Keeping the shapes in one file gives the routes and their tests the
 *   same definition, and a malformed request becomes a 400 with the issues listed instead
 *   of a half-valid object reaching the engine. The intake body is the core `IntakeEvent`
 *   itself, so a second hand-written shape cannot drift from it.
 *
 * Exports: AnswerBody, LastEventId, SettingsPutBody, HarnessPutBody, HarnessSecretBody, LiveQuery,
 *   ProjectCreateBody, ProjectPatchBody, ConnectionCreateBody.
 * Depends on: @forge/core (HarnessAuthMode, HarnessKind, HarnessSecretKind, GitHostConfig, ProjectPrefix,
 *   ProjectCommands, Profile), zod. No IO.
 */

import {
  GitHostConfig,
  HarnessAuthMode,
  HarnessKind,
  HarnessSecretKind,
  Profile,
  ProjectCommands,
  ProjectPrefix,
} from '@forge/core';
import { z } from 'zod';

/** `POST /interactions/:id/answer`; `answer` may be any JSON value except absent. */
export const AnswerBody = z
  .object({ answer: z.unknown() })
  .refine((body) => body.answer !== undefined, {
    message: 'answer is required',
    path: ['answer'],
  });
export type AnswerBody = z.infer<typeof AnswerBody>;

/** A non-negative integer sequence number, as sent in `Last-Event-ID` or `?after=`. */
export const LastEventId = z.coerce.number().int().nonnegative();

/**
 * `PUT /settings/company` and `PUT /settings/projects/:slug`. `doc` is only checked to be an
 * object here; the scope's override schema (strict, deep-partial) judges its keys. The
 * scope and project come from the path, never the body, so a body cannot aim a save at
 * another scope.
 */
export const SettingsPutBody = z
  .object({
    doc: z.record(z.string(), z.unknown()),
    author: z.string().min(1),
    reason: z.string().min(1),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
export type SettingsPutBody = z.infer<typeof SettingsPutBody>;

/** `PUT /harnesses/:id`: where the executable is (PATH when absent) and how it authenticates. */
export const HarnessPutBody = z
  .object({
    kind: HarnessKind,
    binary_path: z.string().min(1).max(1024).optional(),
    auth_mode: HarnessAuthMode,
  })
  .strict();
export type HarnessPutBody = z.infer<typeof HarnessPutBody>;

/**
 * `PUT /harnesses/:id/secret`: a pasted API key or OAuth token. One token, no whitespace;
 * the cap keeps a wrong paste (a file, a page) from reaching the SecretStore.
 */
export const HarnessSecretBody = z
  .object({
    kind: HarnessSecretKind,
    value: z
      .string()
      .min(1)
      .max(4096)
      .regex(/^\S+$/, 'must be a single token without spaces'),
  })
  .strict();
export type HarnessSecretBody = z.infer<typeof HarnessSecretBody>;

/** `?live=1` on the test route turns the paid hello call on; anything else leaves it off. */
export const LiveQuery = z.enum(['1', 'true']);

const Digits = z.string().regex(/^[0-9]+$/);
const RepoFullName = z.string().regex(/^[^/\s]+\/[^/\s]+$/, 'must look like owner/name');

/**
 * Settings a new project may start with besides its git host: the same keys the settings
 * API accepts, so a project is usable (commands, harness) from its first version.
 */
const StartingSettings = z
  .object({
    profile: Profile,
    commands: ProjectCommands,
    default_harness: z.string().min(1),
    remote: z.string().min(1),
  })
  .partial()
  .strict();

/**
 * `POST /projects`. The git host is either given in full (`git_host`) or reached through a
 * GitHub connection (`connection_id` + `repo_full_name` + `installation_id`); never both,
 * never neither. `base_branch`, when given, overrides the host's own.
 */
export const ProjectCreateBody = z
  .object({
    slug: z.string().regex(/^[a-z][a-z0-9-]*$/),
    prefix: ProjectPrefix,
    local_path: z.string().min(1),
    base_branch: z.string().min(1).optional(),
    git_host: GitHostConfig.optional(),
    connection_id: z.string().min(1).optional(),
    repo_full_name: RepoFullName.optional(),
    installation_id: Digits.optional(),
    settings: StartingSettings.optional(),
    author: z.string().min(1),
    reason: z.string().min(1).default('project created'),
  })
  .strict()
  .superRefine((body, ctx) => {
    const viaConnection =
      body.connection_id !== undefined ||
      body.repo_full_name !== undefined ||
      body.installation_id !== undefined;

    if (body.git_host && viaConnection) {
      ctx.addIssue({
        code: 'custom',
        path: ['git_host'],
        message: 'give either git_host or connection_id with repo_full_name, not both',
      });
    }

    if (!body.git_host && !viaConnection) {
      ctx.addIssue({
        code: 'custom',
        path: ['git_host'],
        message:
          'give git_host, or connection_id with repo_full_name and installation_id',
      });
    }

    if (viaConnection) {
      for (const key of ['connection_id', 'repo_full_name', 'installation_id'] as const) {
        if (body[key] === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'required with a GitHub connection',
          });
        }
      }
    }
  });
export type ProjectCreateBody = z.infer<typeof ProjectCreateBody>;

/** `PATCH /projects/:slug`: archiving is the only change a project row takes through the API. */
export const ProjectPatchBody = z.object({ status: z.literal('archived') }).strict();
export type ProjectPatchBody = z.infer<typeof ProjectPatchBody>;

/** `POST /github/connections`; `private_key_pem` goes to the secret store and is never echoed. */
export const ConnectionCreateBody = z
  .object({
    account: z.string().min(1),
    app_id: Digits,
    app_slug: z.string().min(1).optional(),
    private_key_pem: z
      .string()
      .refine(
        (pem) =>
          /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(pem) && pem.includes('-----END'),
        'must be a PEM private key',
      ),
  })
  .strict();
export type ConnectionCreateBody = z.infer<typeof ConnectionCreateBody>;
