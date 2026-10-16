/**
 * Pins: the Modal ignores backdrop clicks, closes on Escape when clean, asks before
 * discarding when dirty, and hands focus back to the button that opened it.
 *
 * Why: a modal holds a half-typed private key or credential. A stray click on the dimmed page
 *   must never throw it away, leaving must always be deliberate, and a keyboard user must land
 *   back where they started.
 * Depends on: src/components/ui/modal. jsdom.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Modal } from '#/components/ui/modal.js';

function Harness(props: { dirty: boolean; busy?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open it
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a thing"
        description="Describe the thing."
        dirty={props.dirty}
        busy={props.busy ?? false}
        discardTitle="Discard this thing?"
        primary={<button type="submit">Add thing</button>}
      >
        <input aria-label="Name" />
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('stays open when the backdrop is clicked', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Harness dirty={false} />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a thing' });

    await user.click(document.body);

    expect(dialog).toBeVisible();
  });

  it('closes on Escape when nothing was typed and returns focus to the opener', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Harness dirty={false} />);
    const opener = screen.getByRole('button', { name: 'Open it' });
    await user.click(opener);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('asks to discard on Escape and on Cancel when dirty, and keeps the form on "Cancel"', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Harness dirty />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    await screen.findByRole('dialog', { name: 'Add a thing' });

    await user.keyboard('{Escape}');

    const ask = await screen.findByRole('alertdialog', { name: 'Discard this thing?' });

    expect(ask).toBeVisible();

    await user.click(screen.getAllByRole('button', { name: 'Cancel' }).at(-1)!);
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );

    expect(screen.getByRole('dialog', { name: 'Add a thing' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('blocks closing while a request is in flight', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Harness dirty busy />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
