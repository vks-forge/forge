/**
 * Schemas of the UI state saved in `localStorage` (one per persisted store).
 *
 * Why: a saved value is read back after an app upgrade, a hand edit or a half-written
 *   save, so it is untrusted input like any other boundary. Each store checks what it reads
 *   against its schema here and falls back to defaults when it does not fit. Each schema
 *   lists exactly the fields the store may persist, and a test pins that list so nobody
 *   quietly starts saving server data, tokens or run content (d-0122).
 *
 * Exports: ThemePrefsSchema, ProjectPrefsSchema, BoardPrefsSchema, ThreadPrefsSchema,
 *   AnswerDraftsSchema, MemoryPrefsSchema, AuthorPrefsSchema, WelcomePrefsSchema.
 * Depends on: zod, @forge/core (Lane, TicketStatus), types/ui-state.types. No IO.
 */

import { Lane, TicketStatus } from '@forge/core';
import { z } from 'zod';
import type {
  AnswerDrafts,
  AuthorPrefs,
  BoardPrefs,
  MemoryPrefs,
  ProjectPrefs,
  ThemePrefs,
  ThreadPrefs,
  WelcomePrefs,
} from '#/types/ui-state.types.js';

export const ThemePrefsSchema: z.ZodType<ThemePrefs> = z.object({
  mode: z.enum(['system', 'light', 'dark']),
});

export const ProjectPrefsSchema: z.ZodType<ProjectPrefs> = z.object({
  slug: z.string().min(1).max(200).nullable(),
});

export const BoardPrefsSchema: z.ZodType<BoardPrefs> = z.object({
  view: z.enum(['tickets', 'cards']),
  filter: z.object({
    lane: z.union([Lane, z.literal('all')]),
    state: z.union([TicketStatus, z.literal('all')]),
    query: z.string().max(500),
  }),
});

export const ThreadPrefsSchema: z.ZodType<ThreadPrefs> = z.object({
  followLatest: z.boolean(),
  expandTools: z.boolean(),
});

export const AnswerDraftsSchema: z.ZodType<AnswerDrafts> = z.object({
  drafts: z.record(z.string(), z.string()),
});

export const MemoryPrefsSchema: z.ZodType<MemoryPrefs> = z.object({
  chosen: z
    .object({
      tab: z.enum(['decisions', 'rejected', 'proposals', 'outcomes']),
      tags: z.array(z.string().max(100)).max(50),
      activeOnly: z.boolean(),
    })
    .nullable(),
});

export const AuthorPrefsSchema: z.ZodType<AuthorPrefs> = z.object({
  author: z.string().max(200),
});

export const WelcomePrefsSchema: z.ZodType<WelcomePrefs> = z.object({
  step: z.enum(['data', 'harness', 'github', 'project']).nullable(),
  dismissed: z.boolean(),
});
