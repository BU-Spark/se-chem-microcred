import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { StudentActionsModal } from './StudentActionsModal';

const mockFetch = jest.fn();
const onClose = jest.fn();
const onCompleted = jest.fn();

function renderModal(overrides: Partial<Parameters<typeof StudentActionsModal>[0]> = {}) {
  return render(
    <StudentActionsModal
      studentName="Ada Lovelace"
      courseId="course-1"
      studentId="student-1"
      email="prof@example.edu"
      badge={{ id: 'badge-1', name: 'Titration', status: 'READY_FOR_ASSESSMENT', qevWaivedAt: null }}
      attemptCount={2}
      lessonTitles={['Titrating an acid']}
      onClose={onClose}
      onCompleted={onCompleted}
      {...overrides}
    />
  );
}

function lastRequestBody() {
  const [, init] = mockFetch.mock.calls.at(-1) as [string, RequestInit];
  return JSON.parse(init.body as string);
}

describe('StudentActionsModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ badge: { status: 'LEARNING' } }) });
  });

  it('offers all three actions, each with a tooltip', () => {
    renderModal();

    expect(screen.getByText('Reset badge progress')).toBeInTheDocument();
    expect(screen.getByText('Complete the QEV requirement')).toBeInTheDocument();
    expect(screen.getByText('Overwrite the in-person grade')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /What does .* do\?/ })).toHaveLength(3);
  });

  it('reveals the tooltip text on demand', () => {
    renderModal();

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /What does “Reset badge progress” do\?/ }));

    expect(screen.getByRole('tooltip')).toHaveTextContent('This cannot be undone.');
  });

  describe('reset', () => {
    it('spells out what will be deleted', () => {
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

      expect(screen.getByText(/2 in-person assessment attempts/)).toBeInTheDocument();
      expect(screen.getByText(/Titrating an acid/)).toBeInTheDocument();
    });

    it('keeps the confirm button disabled until the badge name is typed', () => {
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

      const confirm = screen.getByRole('button', { name: 'Reset progress' });
      expect(confirm).toBeDisabled();

      fireEvent.change(screen.getByLabelText(/Type/), { target: { value: 'Distill' } });
      expect(confirm).toBeDisabled();

      fireEvent.change(screen.getByLabelText(/Type/), { target: { value: 'titration' } });
      expect(confirm).toBeEnabled();
    });

    it('sends the reset once confirmed', async () => {
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
      fireEvent.change(screen.getByLabelText(/Type/), { target: { value: 'Titration' } });
      fireEvent.click(screen.getByRole('button', { name: 'Reset progress' }));

      await waitFor(() => expect(onCompleted).toHaveBeenCalled());
      expect(lastRequestBody()).toEqual({
        action: 'RESET_PROGRESS',
        confirmBadgeName: 'Titration',
        acknowledgeSharedBadges: false,
      });
    });

    it('blocks the reset behind an acknowledgement when other badges share the lessons', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: 'These lessons are also required by other badges, whose progress would be reset too.',
          sharedBadges: [{ id: 'badge-2', name: 'Distillation' }],
        }),
      });

      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
      fireEvent.change(screen.getByLabelText(/Type/), { target: { value: 'Titration' } });
      fireEvent.click(screen.getByRole('button', { name: 'Reset progress' }));

      await waitFor(() => expect(screen.getByText(/Distillation/)).toBeInTheDocument());
      expect(onCompleted).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Reset progress' })).toBeDisabled();

      fireEvent.click(screen.getByRole('checkbox'));
      expect(screen.getByRole('button', { name: 'Reset progress' })).toBeEnabled();
    });
  });

  describe('waive QEV', () => {
    it('is offered only while the student is still learning', () => {
      renderModal({ badge: { id: 'badge-1', name: 'Titration', status: 'LEARNING', qevWaivedAt: null } });

      expect(screen.getByRole('button', { name: 'Waive' })).toBeEnabled();
    });

    it('is unavailable once the requirement is already cleared', () => {
      renderModal();

      expect(screen.getByRole('button', { name: 'Waive' })).toBeDisabled();
      expect(screen.getByText('This student has already cleared the requirement.')).toBeInTheDocument();
    });

    it('is unavailable once already waived', () => {
      renderModal({
        badge: { id: 'badge-1', name: 'Titration', status: 'LEARNING', qevWaivedAt: '2026-08-01T00:00:00.000Z' },
      });

      expect(screen.getByRole('button', { name: 'Waive' })).toBeDisabled();
      expect(screen.getByText('Already waived by an instructor.')).toBeInTheDocument();
    });

    it('warns that the only way back is a full reset, then sends the waiver', async () => {
      renderModal({ badge: { id: 'badge-1', name: 'Titration', status: 'LEARNING', qevWaivedAt: null } });
      fireEvent.click(screen.getByRole('button', { name: 'Waive' }));

      expect(screen.getByText(/reversing it means resetting the badge/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Waive requirement' }));

      await waitFor(() => expect(onCompleted).toHaveBeenCalled());
      expect(lastRequestBody()).toEqual({ action: 'WAIVE_QEV' });
    });
  });

  describe('override grade', () => {
    it('is unavailable until the QEV requirement is cleared', () => {
      renderModal({ badge: { id: 'badge-1', name: 'Titration', status: 'LEARNING', qevWaivedAt: null } });

      expect(screen.getByRole('button', { name: 'Overwrite' })).toBeDisabled();
      expect(screen.getByText('Unavailable until the QEV requirement is cleared or waived.')).toBeInTheDocument();
    });

    it('requires a reason before it can be recorded', () => {
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Overwrite' }));

      expect(screen.getByRole('button', { name: 'Record result' })).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Assessed on paper' } });
      expect(screen.getByRole('button', { name: 'Record result' })).toBeEnabled();
    });

    it('records a still-learning result', async () => {
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Overwrite' }));
      fireEvent.click(screen.getByRole('button', { name: 'Still learning' }));
      fireEvent.change(screen.getByLabelText('Reason'), { target: { value: '  Recorded in error  ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Record result' }));

      await waitFor(() => expect(onCompleted).toHaveBeenCalled());
      expect(lastRequestBody()).toEqual({
        action: 'OVERRIDE_GRADE',
        passed: false,
        reason: 'Recorded in error',
      });
    });
  });

  it('surfaces a server refusal without closing', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Only instructors can perform student actions on a badge.' }),
    });

    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Overwrite' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Assessed on paper' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record result' }));

    await waitFor(() =>
      expect(screen.getByText('Only instructors can perform student actions on a badge.')).toBeInTheDocument()
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(onCompleted).not.toHaveBeenCalled();
  });
});
