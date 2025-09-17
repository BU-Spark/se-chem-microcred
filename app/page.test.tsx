import { render, screen, fireEvent } from '@testing-library/react';
import Home from './page';

// Mock window.open
const mockOpen = jest.fn();
window.open = mockOpen;

describe('Home Page', () => {
  beforeEach(() => {
    mockOpen.mockClear();
  });

  it('renders the main hero heading and subtitle', () => {
    render(<Home />);
    expect(screen.getByText('Spark Your Next Creation! ✨')).toBeInTheDocument();
    expect(
      screen.getByText(
        'A Next.js & TypeScript template designed for rapid development and learning industry best practices.'
      )
    ).toBeInTheDocument();
  });

  it('renders the hero CTA buttons', () => {
    render(<Home />);
    expect(screen.getByRole('button', { name: 'Explore Next.js Docs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View on GitHub' })).toBeInTheDocument();
  });

  it('calls window.open with correct URLs for hero CTA buttons', () => {
    render(<Home />);
    fireEvent.click(screen.getByRole('button', { name: 'Explore Next.js Docs' }));
    expect(mockOpen).toHaveBeenCalledWith('https://nextjs.org/docs', '_blank');

    fireEvent.click(screen.getByRole('button', { name: 'View on GitHub' }));
    expect(mockOpen).toHaveBeenCalledWith('https://github.com/BU-Spark/TEMPLATE-next-js-starter', '_blank');
  });

  const featureData = [
    {
      id: 'modern-stack',
      title: 'Modern Stack',
      description: 'Next.js 15, React 19, TypeScript. Fast, efficient, and type-safe development.',
      details:
        'Leverage server components, client components, and the latest React features for optimal performance and developer experience. TypeScript ensures your codebase is robust and maintainable as it grows.',
    },
    {
      id: 'styling-freedom',
      title: 'Styling Freedom',
      description: 'Styling agnostic! Choose Tailwind, CSS Modules, Emotion, or your favorite solution.',
      details:
        'This template does not impose a specific styling library, giving you the flexibility to integrate the solution that best fits your project needs and team expertise. CSS Modules are used for base template components as a lightweight example.',
    },
    {
      id: 'dev-tools',
      title: 'Dev Tools Ready',
      description: 'ESLint, Prettier, Husky hooks, and Jest testing pre-configured for quality code.',
      details:
        'Automated linting, formatting, and pre-commit/pre-push checks ensure code consistency and quality. A solid testing foundation with Jest and React Testing Library is ready for you to build upon.',
    },
    {
      id: 'responsive-design',
      title: 'Responsive Design',
      description: 'Built with a responsive layout in mind. Looks great on all devices.',
      details:
        'The foundational layout uses modern CSS techniques that adapt to various screen sizes. The provided example components and page structure serve as a starting point for building fully responsive user interfaces.',
    },
  ];

  featureData.forEach((feature) => {
    it(`renders the "${feature.title}" feature card title and description`, () => {
      render(<Home />);
      expect(screen.getByText(feature.title)).toBeInTheDocument();
      expect(screen.getByText(feature.description)).toBeInTheDocument();
    });
  });

  it('renders feature card details when a card is clicked and hides when clicked again', () => {
    render(<Home />);
    const modernStackTitle = 'Modern Stack'; // Title to find the card
    // Text content we expect to find within the <p> tag of Modern Stack's JSX details
    const expectedModernStackDetailsText = /This template utilizes a cutting-edge stack/i;

    const cardButton = screen.getByText(modernStackTitle).closest('div[role="button"]');
    expect(cardButton).toBeInTheDocument();
    expect(cardButton).toHaveAttribute('aria-expanded', 'false');

    const detailsContainer = document.getElementById(`details-modern-stack`);
    expect(detailsContainer).toBeInTheDocument();
    expect(detailsContainer).toHaveAttribute('aria-hidden', 'true');

    // Click to expand
    fireEvent.click(cardButton!);
    expect(cardButton).toHaveAttribute('aria-expanded', 'true');
    expect(detailsContainer).toHaveAttribute('aria-hidden', 'false');
    // Find the details text within the rendered JSX content
    const detailsTextElement = screen.getByText(expectedModernStackDetailsText);
    expect(detailsTextElement).toBeVisible();

    // Click to collapse
    fireEvent.click(cardButton!);
    expect(cardButton).toHaveAttribute('aria-expanded', 'false');
    expect(detailsContainer).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the footer with correct text', () => {
    render(<Home />);
    expect(
      screen.getByText('This template is a launchpad for your amazing projects. Happy coding!')
    ).toBeInTheDocument();
  });
});
