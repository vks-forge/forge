/**
 * Contract every `TriggerAdapter` must pass: `describeTriggerAdapterContract(name, make, sample)`.
 *
 * Why: the intake door and the polling loop call adapters without knowing which source is
 *   behind them, so every adapter must reject junk instead of half-accepting it, stamp the
 *   source it owns, produce a dedupe key the engine can trust, and give the same answer when
 *   the source redelivers the same payload (otherwise a retry would create a second ticket).
 *   A polled adapter must also say so in `capabilities()` and return only valid events.
 *   A new adapter passes this before it gets tests of its own.
 *
 * Exports: describeTriggerAdapterContract(), TriggerContractSample.
 * Depends on: vitest, @forge/core (TriggerAdapter, IntakeEvent).
 */

import { IntakeEvent } from '@forge/core';
import type { TriggerAdapter } from '@forge/core';
import { describe, expect, it } from 'vitest';

/** A payload the adapter must accept, and ones it must refuse. */
export interface TriggerContractSample {
  readonly valid: unknown;
  /** Same delivery again (a redelivery or retry), possibly as a fresh object. */
  readonly redelivery: unknown;
  readonly invalid: readonly unknown[];
}

export function describeTriggerAdapterContract(
  name: string,
  make: () => TriggerAdapter,
  sample: TriggerContractSample,
): void {
  describe(`TriggerAdapter contract: ${name}`, () => {
    it('has an id and declares what it can do', () => {
      const adapter = make();

      expect(adapter.id.length).toBeGreaterThan(0);
      expect(adapter.capabilities().push || adapter.capabilities().poll).toBe(true);
      expect(typeof adapter.poll === 'function').toBe(adapter.capabilities().poll);
    });

    it('normalises a valid payload to an IntakeEvent of its own source with a dedupe key', () => {
      const adapter = make();

      const event = adapter.normalise(sample.valid);

      expect(IntakeEvent.safeParse(event).success).toBe(true);
      expect(event.source).toBe(adapter.source);
      expect(event.dedupe_key.length).toBeGreaterThan(0);
    });

    it('rejects every invalid payload by throwing, never returning a partial event', () => {
      const adapter = make();

      for (const raw of sample.invalid) {
        expect(() => adapter.normalise(raw)).toThrow();
      }
    });

    it('is idempotent: a redelivered payload gives the same event', () => {
      const adapter = make();

      expect(adapter.normalise(sample.redelivery)).toEqual(
        adapter.normalise(sample.valid),
      );
    });

    it('polls only valid events of its own source, when it can poll', async () => {
      const adapter = make();
      if (!adapter.capabilities().poll) {
        return;
      }

      const events = await adapter.poll?.(null);

      expect(events).toBeDefined();
      for (const event of events ?? []) {
        expect(IntakeEvent.safeParse(event).success).toBe(true);
        expect(event.source).toBe(adapter.source);
      }
    });
  });
}
