import { render, screen, fireEvent } from '@testing-library/react';
import { FeatureCard } from './FeatureCard';

describe('FeatureCard', () => {
  const mockOnClick = jest.fn();
  const defaultProps = {
    id: 'test-card-1',
    icon: '🚀',
    title: 'Test Title',
    description: 'Test Description',
    details: 'Test Details',
    isExpanded: false,
    onClick: mockOnClick,
  };

  beforeEach(() => {
    mockOnClick.mockClear();
  });

  test('renders correctly when collapsed', () => {
    render(<FeatureCard {...defaultProps} />);
    expect(screen.getByText('🚀')).toBeInTheDocument(); // Icon
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test Description')).toBeInTheDocument();

    const detailsElement = screen.getByText('Test Details').closest('div');
    expect(detailsElement).toHaveClass('featureDetails');
    expect(detailsElement).not.toHaveClass('detailsVisible');
    expect(detailsElement).toHaveAttribute('aria-hidden', 'true');

    const cardElement = screen.getByRole('button');
    expect(cardElement).toHaveAttribute('aria-expanded', 'false');
    expect(cardElement).toHaveAttribute('aria-controls', 'details-test-card-1');
    expect(cardElement).toHaveAttribute('tabindex', '0');
  });

  test('renders correctly when expanded', () => {
    render(<FeatureCard {...defaultProps} isExpanded={true} />);
    expect(screen.getByText('🚀')).toBeInTheDocument();
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test Description')).toBeInTheDocument();

    const detailsElement = screen.getByText('Test Details').closest('div');
    expect(detailsElement).toHaveClass('featureDetails');
    expect(detailsElement).toHaveClass('detailsVisible');
    expect(detailsElement).toHaveAttribute('aria-hidden', 'false');

    const cardElement = screen.getByRole('button');
    expect(cardElement).toHaveAttribute('aria-expanded', 'true');
  });

  test('calls onClick with id when clicked', () => {
    render(<FeatureCard {...defaultProps} />);
    const cardElement = screen.getByRole('button');
    fireEvent.click(cardElement);
    expect(mockOnClick).toHaveBeenCalledTimes(1);
    expect(mockOnClick).toHaveBeenCalledWith('test-card-1');
  });

  test('calls onClick with id when Enter key is pressed', () => {
    render(<FeatureCard {...defaultProps} />);
    const cardElement = screen.getByRole('button');
    fireEvent.keyDown(cardElement, { key: 'Enter', code: 'Enter' });
    expect(mockOnClick).toHaveBeenCalledTimes(1);
    expect(mockOnClick).toHaveBeenCalledWith('test-card-1');
  });

  test('calls onClick with id when Space key is pressed', () => {
    render(<FeatureCard {...defaultProps} />);
    const cardElement = screen.getByRole('button');
    fireEvent.keyDown(cardElement, { key: ' ', code: 'Space' }); // Note: key is a space
    expect(mockOnClick).toHaveBeenCalledTimes(1);
    expect(mockOnClick).toHaveBeenCalledWith('test-card-1');
  });

  test('does not call onClick for other key presses', () => {
    render(<FeatureCard {...defaultProps} />);
    const cardElement = screen.getByRole('button');
    fireEvent.keyDown(cardElement, { key: 'A', code: 'KeyA' });
    expect(mockOnClick).not.toHaveBeenCalled();
  });
});
