import { render, screen, waitFor } from '@testing-library/react';

import AssessmentCodeModal from '@/app/components/AssessmentCodeModal';

/**
 * These cases used to drive the QR through the Badge Passport (/badges), which
 * hosted every badge state. The passport is now a completed-only record and no
 * longer opens an assessment QR, so the regression that matters — the code must
 * be scoped to the BADGE's course, not whichever enrollment the caller happens
 * to be looking at — is asserted on the modal itself.
 */
describe('Assessment QR scoping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'ABCD-2345', expiresAt: '2026-06-30T12:30:00.000Z' }),
    }) as unknown as typeof fetch;
  });

  it('encodes the badge, student and course into the scanned URL', async () => {
    render(
      <AssessmentCodeModal
        badgeId="badge-assess-1"
        badgeName="Assessment Badge"
        courseId="course-1"
        studentId="student-1"
        onClose={jest.fn()}
      />
    );

    const qrImage = screen.getByAltText(/Assessment Badge QR code/i) as HTMLImageElement;
    expect(qrImage.src).toContain('/api/qr?size=360');
    expect(qrImage.src).toContain(encodeURIComponent('/qr/assessment'));
    expect(qrImage.src).toContain('courseId%3Dcourse-1');
    expect(qrImage.src).toContain('studentId%3Dstudent-1');
    expect(qrImage.src).toContain('badgeId%3Dbadge-assess-1');
    expect(await screen.findByText('ABCD-2345')).toBeInTheDocument();
  });

  it('uses the caller-supplied course for the short code, not a default enrollment', async () => {
    render(
      <AssessmentCodeModal
        badgeId="badge-assess-1"
        badgeName="Assessment Badge"
        courseId="course-2"
        studentId="student-1"
        onClose={jest.fn()}
      />
    );

    const qrImage = screen.getByAltText(/Assessment Badge QR code/i) as HTMLImageElement;
    expect(qrImage.src).toContain('courseId%3Dcourse-2');
    expect(qrImage.src).not.toContain('courseId%3Dcourse-1');

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/assessment-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: 'course-2', badgeId: 'badge-assess-1' }),
      });
    });
  });
});
