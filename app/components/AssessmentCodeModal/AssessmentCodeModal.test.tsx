import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import AssessmentCodeModal from './index';

describe('AssessmentCodeModal', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'ABCD-2345' }) });
  });

  it('builds the assessment QR URL and requests a short code', async () => {
    render(
      <AssessmentCodeModal
        badgeId="badge-1"
        badgeName="Lab Safety"
        courseId="course-1"
        studentId="student-1"
        onClose={jest.fn()}
      />
    );

    const image = screen.getByAltText('Lab Safety QR code') as HTMLImageElement;
    expect(image.src).toContain('courseId%3Dcourse-1');
    expect(image.src).toContain('studentId%3Dstudent-1');
    expect(image.src).toContain('badgeId%3Dbadge-1');
    expect(await screen.findByText('ABCD-2345')).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/assessment-codes', expect.any(Object)));
  });

  it('closes from the close button and Escape', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <AssessmentCodeModal
        badgeId="badge-1"
        badgeName="Lab Safety"
        courseId="course-1"
        studentId="student-1"
        onClose={onClose}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
