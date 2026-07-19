import { fireEvent, render, screen } from '@testing-library/react';

import BadgeInfoStep from './BadgeInfoStep';
import { DEFAULT_DRAFT, type BadgeDraft } from '../types';

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
