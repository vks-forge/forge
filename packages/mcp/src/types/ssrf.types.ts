/**
 * Types for the SSRF-guarded fetch.
 *
 * Why: the guard's limits (allow-list, timeout, byte cap) and its injected network
 *   ports are the knobs a test or the tool turns; naming them keeps the guard itself
 *   free of ambient configuration, so every refusal is reproducible with stubs.
 *
 * Exports: GuardOptions, FetchedText.
 * Depends on: types/deps.types. No IO.
 */

import type { DnsResolver, HttpTransport } from '#/types/deps.types.js';

export interface GuardOptions {
  resolve: DnsResolver;
  transport: HttpTransport;
  allowHosts: readonly string[];
  timeoutMs: number;
  maxBytes: number;
}

export interface FetchedText {
  text: string;
  finalUrl: string;
  truncated: boolean;
}
