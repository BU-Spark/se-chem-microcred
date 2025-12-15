/** @jest-environment node */

import { GET, HEAD } from '../app/api/qr/route';

const buildUrl = (qs: string) => new URL(`http://localhost/api/qr?${qs}`).toString();
const requestLike = (qs: string) => ({ url: buildUrl(qs) }) as Request;

describe('QR API', () => {
  const payload = 'student:test|badge:test';

  it('returns a PNG with content length', async () => {
    const res = await GET(requestLike(`data=${encodeURIComponent(payload)}&size=180`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');

    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.byteLength).toBeGreaterThan(0);
    expect(res.headers.get('content-length')).toBe(String(buf.byteLength));
  });

  it('handles HEAD requests with correct headers', async () => {
    const res = await HEAD(requestLike(`data=${encodeURIComponent(payload)}&size=180`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(Number.parseInt(res.headers.get('content-length') ?? '0', 10)).toBeGreaterThan(0);
    const body = await res.arrayBuffer();
    expect(body.byteLength).toBe(0);
  });

  it('returns 400 for missing data', async () => {
    const res = await GET(requestLike(''));
    expect(res.status).toBe(400);
  });
});
