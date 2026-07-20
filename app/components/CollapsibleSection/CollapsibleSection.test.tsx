import { fireEvent, render, screen } from '@testing-library/react';

import CollapsibleSection from './index';

describe('CollapsibleSection', () => {
  it('connects its toggle to the visible panel', () => {
    render(
      <CollapsibleSection title="Completed" isOpen onToggle={jest.fn()} panelId="completed-badges">
        Completed badge list
      </CollapsibleSection>
    );

    const toggle = screen.getByRole('button', { name: 'Completed' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', 'completed-badges');
    expect(screen.getByText('Completed badge list')).toHaveAttribute('id', 'completed-badges');
  });

  it('calls onToggle and hides closed content', () => {
    const onToggle = jest.fn();
    render(
      <CollapsibleSection title="Not yet started" isOpen={false} onToggle={onToggle} panelId="pending-badges">
        Pending badge list
      </CollapsibleSection>
    );

    const toggle = screen.getByRole('button', { name: 'Not yet started' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Pending badge list')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
