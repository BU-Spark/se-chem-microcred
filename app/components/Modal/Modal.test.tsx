import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Modal from './index';

describe('Modal', () => {
  it('exposes accessible dialog semantics', () => {
    render(
      <Modal onClose={jest.fn()} ariaLabel="Example dialog">
        <button type="button">First action</button>
      </Modal>
    );

    expect(screen.getByRole('dialog', { name: 'Example dialog' })).toHaveAttribute('aria-modal', 'true');
  });

  it('moves focus inside, traps tab navigation, and restores focus', async () => {
    const user = userEvent.setup();
    const outside = document.createElement('button');
    outside.textContent = 'Outside';
    document.body.appendChild(outside);
    outside.focus();
    const { unmount } = render(
      <Modal onClose={jest.fn()} ariaLabel="Example dialog">
        <button type="button">First</button>
        <button type="button">Last</button>
      </Modal>
    );

    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });
    expect(first).toHaveFocus();

    last.focus();
    await user.tab();
    expect(first).toHaveFocus();

    await user.tab({ shift: true });
    expect(last).toHaveFocus();

    unmount();
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it('closes on Escape and an overlay click but not a content click', () => {
    const onClose = jest.fn();
    render(
      <Modal onClose={onClose} ariaLabel="Example dialog" overlayClassName="overlay">
        <button type="button">Content</button>
      </Modal>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Content' }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(document.querySelector('.overlay') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('can disable Escape and overlay closing', () => {
    const onClose = jest.fn();
    render(
      <Modal
        onClose={onClose}
        ariaLabel="Persistent dialog"
        overlayClassName="overlay"
        closeOnEscape={false}
        closeOnOverlayClick={false}
      >
        <button type="button">Content</button>
      </Modal>
    );

    fireEvent.click(document.querySelector('.overlay') as HTMLElement);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
