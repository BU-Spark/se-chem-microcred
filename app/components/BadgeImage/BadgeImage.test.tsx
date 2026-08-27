import { render, screen } from '@testing-library/react';
import BadgeImage from './BadgeImage';

jest.mock('@/app/components/Video/Youtube/YoutubeThumbnail', () => ({
  __esModule: true,
  default: ({ videoUrl, alt }: { videoUrl?: string | null; alt: string }) => (
    <span data-testid="youtube-fallback" data-video-url={videoUrl}>
      {alt}
    </span>
  ),
}));

describe('BadgeImage', () => {
  it("renders at the badge's stored zoom", () => {
    render(<BadgeImage imageUrl="data:image/png;base64,YWJj" imageScale={200} alt="Zoomed" />);
    expect(screen.getByRole('img', { name: 'Zoomed' })).toHaveStyle({
      transform: 'scale(2) translate(0%, 0%)',
    });
  });

  it('falls back to the legacy fixed crop when no zoom is stored', () => {
    render(<BadgeImage imageUrl="data:image/png;base64,YWJj" alt="Legacy" />);
    expect(screen.getByRole('img', { name: 'Legacy' })).toHaveStyle({
      transform: 'scale(1.15) translate(0%, 0%)',
    });
  });

  it('never zooms below 100%, which would leave a gap at the edge of the circle', () => {
    render(<BadgeImage imageUrl="data:image/png;base64,YWJj" imageScale={10} alt="Clamped" />);
    expect(screen.getByRole('img', { name: 'Clamped' })).toHaveStyle({
      transform: 'scale(1) translate(0%, 0%)',
    });
  });

  it('prefers uploaded badge artwork', () => {
    render(
      <BadgeImage
        imageUrl="data:image/png;base64,YWJj"
        imagePositionX={23}
        imagePositionY={78}
        videoUrl="https://youtu.be/legacy"
        alt="Safety"
      />
    );
    const image = screen.getByRole('img', { name: 'Safety' });
    expect(image).toHaveAttribute('src', 'data:image/png;base64,YWJj');
    expect(image).toHaveStyle({
      display: 'block',
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      objectPosition: '23% 78%',
    });
    expect(image).toHaveStyle({ transform: 'scale(1.15) translate(2.7%, -2.8%)' });
    expect(screen.queryByTestId('youtube-fallback')).not.toBeInTheDocument();
  });

  it('centers existing artwork that has no saved focal point', () => {
    render(<BadgeImage imageUrl="data:image/png;base64,YWJj" alt="Legacy badge" />);
    expect(screen.getByRole('img', { name: 'Legacy badge' })).toHaveStyle({ objectPosition: '50% 50%' });
    expect(screen.getByRole('img', { name: 'Legacy badge' })).toHaveStyle({
      transform: 'scale(1.15) translate(0%, 0%)',
    });
  });

  it('uses the legacy video thumbnail when artwork is absent', () => {
    render(<BadgeImage videoUrl="https://youtu.be/legacy" alt="Safety" />);
    expect(screen.getByTestId('youtube-fallback')).toHaveAttribute('data-video-url', 'https://youtu.be/legacy');
  });
});
