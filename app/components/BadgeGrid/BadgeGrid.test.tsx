import { fireEvent, render, screen } from '@testing-library/react';
import BadgeGrid from './index';

describe('BadgeGrid', () => {
  it('renders selectable badges', () => {
    const onSelect = jest.fn();
    render(<BadgeGrid badges={[{ id: 'badge-1', name: 'Safety' }]} onSelectBadge={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Safety' }));
    expect(onSelect).toHaveBeenCalledWith('badge-1');
  });
  it('renders its empty state', () => {
    render(<BadgeGrid badges={[]} />);
    expect(screen.getByText('No badges in this section.')).toBeInTheDocument();
  });
});
