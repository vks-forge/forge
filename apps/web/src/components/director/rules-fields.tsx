/**
 * HouseRulesField and ApprovalField: the Director's standing instructions and approval mode.
 *
 * Why: house rules are text appended to every Director step on top of its playbook, so the
 *   owner can say "we never touch the billing module" once instead of in every card. The
 *   field says what it does and where it applies. The approval mode decides whether a plan
 *   that passes the fixed checks may start without the owner; both choices are listed with
 *   what they mean, because "always ask" costs attention and "director approves" costs
 *   oversight, and the owner should pick knowingly.
 *
 * Exports: HouseRulesField, ApprovalField.
 * Depends on: components/ui/field, components/ui/picker, domain/director-settings.
 */

import { INPUT_CLASS } from '#/components/ui/field.js';
import { Picker } from '#/components/ui/picker.js';
import { APPROVAL_ITEMS } from '#/domain/director-settings.js';
import type { ApprovalMode } from '#/schemas/director-config.js';

export function HouseRulesField(props: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid max-w-3xl gap-1.5">
      <label htmlFor="director-house-rules" className="text-sm font-medium">
        House rules
      </label>
      <textarea
        id="director-house-rules"
        aria-describedby="director-house-rules-hint"
        rows={5}
        value={props.value}
        placeholder="For example: never edit files under billing/. Prefer small tickets."
        className={`${INPUT_CLASS} py-2`}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <p id="director-house-rules-hint" className="text-xs text-muted">
        Added to every Director step, after its playbook. Plain sentences work best. It
        cannot loosen the locked rules below.
      </p>
    </div>
  );
}

export function ApprovalField(props: {
  value: ApprovalMode;
  onChange: (value: ApprovalMode) => void;
}) {
  return (
    <div className="grid max-w-xl gap-1.5">
      <p id="director-approval-label" className="text-sm font-medium">
        Plan approval
      </p>
      <Picker
        aria-labelledby="director-approval-label"
        items={APPROVAL_ITEMS}
        value={props.value}
        onChange={(v) =>
          props.onChange(v === 'always_ask' ? 'always_ask' : 'director_or_user')
        }
      />
      <p className="text-xs text-muted">
        Even when the Director may approve, a plan that fails the fixed checks always
        waits for you.
      </p>
    </div>
  );
}
