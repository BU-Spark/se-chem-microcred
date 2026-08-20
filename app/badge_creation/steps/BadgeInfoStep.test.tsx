import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import BadgeInfoStep from './BadgeInfoStep';
import { DEFAULT_DRAFT, type BadgeDraft } from '../types';

jest.mock('../lib/badge-image', () => ({
  prepareBadgeImage: jest.fn().mockResolvedValue('data:image/webp;base64,compressed'),
}));

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: jest.fn(() => 'blob:badge-preview'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: jest.fn(),
  });
});

function renderStep(overrides: Partial<BadgeDraft> = {}) {
  const updateDraft = jest.fn();
  const draft = { ...DEFAULT_DRAFT, ...overrides };
  render(<BadgeInfoStep draft={draft} updateDraft={updateDraft} />);
  return { updateDraft };
}

describe('BadgeInfoStep assessment policy fields', () => {
  it('binds the reassessment limit input to its own draft field', () => {
    renderStep({ reassessmentLimit: 3, badgeName: 'Chem Badge' });
    const input = screen.getByLabelText('Re-assessment Limit') as HTMLInputElement;
    // Regression guard: it must reflect reassessmentLimit, not badgeName.
    expect(input.value).toBe('3');
  });

  it('writes an integer reassessment limit back to the draft', () => {
    const { updateDraft } = renderStep();
    fireEvent.change(screen.getByLabelText('Re-assessment Limit'), { target: { value: '2' } });
    expect(updateDraft).toHaveBeenCalledWith('reassessmentLimit', 2);
  });

  it('never stores NaN when the limit is cleared', () => {
    const { updateDraft } = renderStep({ reassessmentLimit: 2 });
    fireEvent.change(screen.getByLabelText('Re-assessment Limit'), { target: { value: '' } });
    expect(updateDraft).toHaveBeenCalledWith('reassessmentLimit', 0);
  });

  it('clamps the cooldown to the 0–14 range', () => {
    const { updateDraft } = renderStep();
    fireEvent.change(screen.getByLabelText('Cooldown Duration (days)'), { target: { value: '30' } });
    expect(updateDraft).toHaveBeenCalledWith('cooldownDays', 14);
  });

  it('toggles the reassessment-required checkbox from its checked state', () => {
    const { updateDraft } = renderStep({ reassessmentRequired: false });
    const checkbox = screen.getByRole('checkbox', { name: /Re-assessment Required/i }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(updateDraft).toHaveBeenCalledWith('reassessmentRequired', true);
  });
});

describe('BadgeInfoStep image upload', () => {
  it('contains a persisted video thumbnail when an edited badge has no uploaded image', () => {
    renderStep({ imageUrl: '', youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });

    const preview = screen.getByAltText('Badge image preview').parentElement;
    expect(preview).toHaveStyle({
      position: 'relative',
      width: '112px',
      height: '112px',
      flex: '0 0 112px',
      overflow: 'hidden',
    });

    expect(screen.queryByRole('button', { name: 'Adjust image position' })).not.toBeInTheDocument();
  });

  it('shows the selected image in the circular preview immediately', async () => {
    const { updateDraft } = renderStep();
    const file = new File(['image'], 'badge.png', { type: 'image/png' });

    fireEvent.change(screen.getByLabelText('Badge image'), { target: { files: [file] } });

    expect(screen.getByAltText('Badge image preview')).toHaveAttribute('src', 'blob:badge-preview');
    await waitFor(() => expect(updateDraft).toHaveBeenCalledWith('imageUrl', 'data:image/webp;base64,compressed'));
    expect(screen.getByAltText('Badge image preview')).toHaveAttribute('src', 'data:image/webp;base64,compressed');
  });

  it('opens a dialog where dragging updates the circular crop', () => {
    const { updateDraft } = renderStep({ imageUrl: 'data:image/webp;base64,compressed' });
    fireEvent.click(screen.getByRole('button', { name: 'Adjust image position' }));

    const canvas = screen.getByTestId('badge-image-position-canvas');
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 200, height: 200, left: 0, top: 0, right: 200, bottom: 200 }),
    });
    Object.defineProperty(canvas, 'setPointerCapture', { configurable: true, value: jest.fn() });

    const pointerDown = new Event('pointerdown', { bubbles: true });
    Object.assign(pointerDown, { pointerId: 1, clientX: 100, clientY: 100 });
    const pointerMove = new Event('pointermove', { bubbles: true });
    Object.assign(pointerMove, { pointerId: 1, clientX: 140, clientY: 80 });
    fireEvent(canvas, pointerDown);
    fireEvent(canvas, pointerMove);

    expect(updateDraft).toHaveBeenCalledWith('imagePositionX', 30);
    expect(updateDraft).toHaveBeenCalledWith('imagePositionY', 60);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
