/**
 * Input shapes for the eight Forge tools.
 *
 * Why: these shapes are both the validation the server applies and the JSON schema the
 *   harness sees; the catalogue pins a hash of that schema, so a change here is a
 *   reviewed change to what a Worker can send. Bounds (lengths, result counts) are part
 *   of the contract so a model cannot stuff megabytes into a comment or a query.
 *
 * Exports: TicketIdField, GetTicketInput, AddCommentInput, AskDirectorInput,
 *   ReportBlockedInput, FinishInput, WebSearchInput, DocsLookupInput, WebFetchInput,
 *   MAX_SEARCH_RESULTS.
 * Depends on: @forge/core (Claim, TICKET_ID_PATTERN), zod. No IO.
 */

import { Claim, TICKET_ID_PATTERN } from '@forge/core';
import { z } from 'zod';

export const MAX_SEARCH_RESULTS = 10;

export const TicketIdField = z.string().regex(TICKET_ID_PATTERN);

export const GetTicketInput = { id: TicketIdField };

export const AddCommentInput = {
  ticket: TicketIdField,
  text: z.string().min(1).max(10_000),
};

export const AskDirectorInput = { question: z.string().min(1).max(4_000) };

export const ReportBlockedInput = { reason: z.string().min(1).max(4_000) };

export const FinishInput = {
  summary: z.string().min(1).max(10_000),
  claims: z.array(Claim).max(200).default([]),
};

export const WebSearchInput = {
  query: z.string().min(1).max(500),
  max_results: z.number().int().min(1).max(MAX_SEARCH_RESULTS).default(5),
  engines: z
    .array(z.string().regex(/^[a-z0-9_.-]{1,40}$/i))
    .max(10)
    .optional(),
};

export const DocsLookupInput = {
  path: z.string().min(1).max(300),
  max_bytes: z.number().int().positive().optional(),
};

export const WebFetchInput = {
  url: z.url({ protocol: /^https?$/ }).max(2_048),
};
