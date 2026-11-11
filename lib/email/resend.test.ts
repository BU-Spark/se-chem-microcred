/** @jest-environment node */

const mockBatchSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ batch: { send: mockBatchSend } })),
}));

import { sendEmails } from './resend';

const email = (to: string) => ({ to, subject: 'S', html: '<p>B</p>', text: 'B' });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.RESEND_API_KEY = 're_test';
  process.env.EMAIL_FROM = 'Chem Skills <noreply@example.edu>';
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('sendEmails', () => {
  it('skips everything when email is not configured', async () => {
    delete process.env.EMAIL_FROM;
    const results = await sendEmails([email('a@bu.edu')], 'p');
    expect(results).toEqual([{ status: 'SKIPPED', error: 'Email is not configured.' }]);
    expect(mockBatchSend).not.toHaveBeenCalled();
  });

  it('maps permissive batch errors back to the right recipients', async () => {
    mockBatchSend.mockResolvedValue({
      data: { data: [{ id: 'id-a' }, { id: 'id-c' }], errors: [{ index: 1, message: 'Invalid `to`' }] },
      error: null,
    });

    const results = await sendEmails([email('a@bu.edu'), email('bad'), email('c@bu.edu')], 'msg-1');

    expect(results).toEqual([
      { status: 'SENT', id: 'id-a' },
      { status: 'FAILED', error: 'Invalid `to`' },
      { status: 'SENT', id: 'id-c' },
    ]);
    expect(mockBatchSend).toHaveBeenCalledWith(
      [
        expect.objectContaining({ from: 'Chem Skills <noreply@example.edu>', to: 'a@bu.edu' }),
        expect.anything(),
        expect.anything(),
      ],
      { idempotencyKey: 'msg-1-0', batchValidation: 'permissive' }
    );
  });

  it('fails the whole chunk on an API error without throwing', async () => {
    mockBatchSend.mockResolvedValue({ data: null, error: { message: 'Rate limit', statusCode: 429 } });
    const results = await sendEmails([email('a@bu.edu'), email('b@bu.edu')], 'p');
    expect(results).toEqual([
      { status: 'FAILED', error: 'Rate limit' },
      { status: 'FAILED', error: 'Rate limit' },
    ]);
  });

  it('splits large sends into chunks of 100', async () => {
    mockBatchSend.mockImplementation((chunk: unknown[]) =>
      Promise.resolve({ data: { data: chunk.map((_, i) => ({ id: `id-${i}` })), errors: [] }, error: null })
    );
    const results = await sendEmails(
      Array.from({ length: 150 }, (_, i) => email(`s${i}@bu.edu`)),
      'p'
    );
    expect(mockBatchSend).toHaveBeenCalledTimes(2);
    expect(mockBatchSend.mock.calls[1][1]).toMatchObject({ idempotencyKey: 'p-1' });
    expect(results.filter((result) => result.status === 'SENT')).toHaveLength(150);
  });
});
