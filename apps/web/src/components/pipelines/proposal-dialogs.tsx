/**
 * AcceptProposalDialog and RejectProposalDialog: the two confirmations of a pipeline proposal.
 *
 * Why: accepting rewrites a lane every future ticket of the project follows, and rejecting is
 *   remembered for good (the same suggestion is never made again for that lane list), so neither
 *   is a bare click. Accept restates what will change (the lane list with its changes marked, so the
 *   owner confirms what they see) and takes an optional note recorded with the new version;
 *   Reject needs a reason, which is the only thing that makes "never again" a considered act. Cancel
 *   and Escape always leave, and the confirm button names the act.
 *
 * Exports: AcceptProposalDialog, RejectProposalDialog.
 * Depends on: react, components/pipelines/lane-diff-list, components/ui/confirm-dialog,
 *   components/ui/field, domain/proposal-copy, @forge/core (types).
 */

import { useState } from 'react';
import type { PipelineProposalView } from '@forge/core';
import { LaneDiffList } from '#/components/pipelines/lane-diff-list.js';
import { ConfirmDialog } from '#/components/ui/confirm-dialog.js';
import { INPUT_CLASS } from '#/components/ui/field.js';
import { proposalHeadline, ruleTargetWords } from '#/domain/proposal-copy.js';

export function AcceptProposalDialog(props: {
  proposal: PipelineProposalView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const { proposal } = props;
  const [note, setNote] = useState('');

  return (
    <ConfirmDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Change this lane for the project?"
      description={`${proposalHeadline(proposal)}. ${ruleTargetWords(proposal.lane)}`}
      confirmLabel="Accept the change"
      onConfirm={() => {
        props.onConfirm(note);
        setNote('');
      }}
    >
      <LaneDiffList
        label="The lane after the change"
        current={proposal.current}
        proposed={proposal.proposed}
      />
      <label className="grid gap-1.5 text-sm font-medium">
        Note (optional)
        <input
          value={note}
          maxLength={500}
          placeholder="Why you accept it"
          onChange={(event) => setNote(event.target.value)}
          className={INPUT_CLASS}
        />
      </label>
    </ConfirmDialog>
  );
}

export function RejectProposalDialog(props: {
  proposal: PipelineProposalView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <ConfirmDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Reject this suggestion?"
      description={`${proposalHeadline(props.proposal)}. The lane stays as it is, and the Director will not suggest this again unless the lane changes.`}
      confirmLabel="Reject the suggestion"
      tone="danger"
      confirmDisabled={reason.trim().length < 3}
      onConfirm={() => {
        props.onConfirm(reason);
        setReason('');
      }}
    >
      <label className="grid gap-1.5 text-sm font-medium">
        Reason for rejecting
        <input
          value={reason}
          maxLength={500}
          placeholder="Why (at least 3 characters)"
          onChange={(event) => setReason(event.target.value)}
          className={INPUT_CLASS}
        />
      </label>
    </ConfirmDialog>
  );
}
