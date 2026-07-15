import { render, screen } from '@testing-library/react';

import BadgeToken from './index';

describe('BadgeToken', () => {
  it('renders badge content in a div by default', () => {
    render(<BadgeToken className="badge-token">Safety badge</BadgeToken>);

    expect(screen.getByText('Safety badge')).toHaveClass('badge-token');
    expect(screen.getByText('Safety badge').tagName).toBe('DIV');
  });

  it('supports a span when used inside a link', () => {
    render(<BadgeToken as="span">Course badge</BadgeToken>);

    expect(screen.getByText('Course badge').tagName).toBe('SPAN');
  });
});
