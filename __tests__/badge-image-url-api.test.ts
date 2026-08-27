/** @jest-environment node */
// Issues: #246 alternative image uploads

import { NextRequest } from 'next/server';
import dns from 'node:dns/promises';

import { POST } from '../app/api/uploads/badge-image/route';
import { ensureCurrentUser } from '../app/api/courses/lib/ensure-user';

jest.mock('../app/api/courses/lib/ensure-user', () => ({
  ensureCurrentUser: jest.fn(),
}));

jest.mock('node:dns/promises', () => ({
  __esModule: true,
  default: { lookup: jest.fn() },
  lookup: jest.fn(),
}));

const mockEnsureUser = ensureCurrentUser as jest.MockedFunction<typeof ensureCurrentUser>;
const mockLookup = dns.lookup as unknown as jest.Mock;
const mockFetch = jest.fn();

function post(url: unknown) {
  return POST(
    new NextRequest('http://localhost/api/uploads/badge-image', {
      method: 'POST',
      body: JSON.stringify({ url }),
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

function imageResponse(contentType = 'image/png', bytes = Buffer.from('not-really-a-png')) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': contentType, 'content-length': String(bytes.byteLength) }),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

// Issue #246: this route fetches a URL the caller supplies, so the guards against
// it being pointed at private infrastructure are the part that matters most.
describe('POST /api/uploads/badge-image (#246)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureUser.mockResolvedValue({ id: 'user-1' } as Awaited<ReturnType<typeof ensureCurrentUser>>);
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('rejects an anonymous caller', async () => {
    mockEnsureUser.mockResolvedValue(null);
    const response = await post('https://example.com/badge.png');
    expect(response.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('requires a URL', async () => {
    expect((await post('')).status).toBe(400);
    expect((await post(undefined)).status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([
    ['file:///etc/passwd', 'a non-http scheme'],
    ['ftp://example.com/badge.png', 'a non-http scheme'],
    ['not a url at all', 'an unparseable value'],
  ])('refuses %s (%s)', async (url) => {
    const response = await post(url);
    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([
    ['http://127.0.0.1/badge.png', 'loopback'],
    ['http://169.254.169.254/latest/meta-data/', 'cloud metadata'],
    ['http://10.1.2.3/badge.png', 'private class A'],
    ['http://192.168.1.1/badge.png', 'private class C'],
    ['http://172.16.5.4/badge.png', 'private class B'],
    ['http://[::1]/badge.png', 'IPv6 loopback'],
  ])('refuses %s (%s) without fetching it', async (url) => {
    const response = await post(url);
    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refuses a public hostname that resolves to a private address', async () => {
    mockLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    const response = await post('https://totally-innocent.example.com/badge.png');
    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refuses when any one of several resolved addresses is private', async () => {
    mockLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ]);
    expect((await post('https://example.com/badge.png')).status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('re-checks the destination of a redirect rather than trusting the first hop', async () => {
    mockLookup.mockImplementation(async (hostname: string) =>
      hostname === 'example.com' ? [{ address: '93.184.216.34', family: 4 }] : [{ address: '127.0.0.1', family: 4 }]
    );
    mockFetch.mockResolvedValueOnce({
      status: 302,
      ok: false,
      headers: new Headers({ location: 'http://internal.example/badge.png' }),
    });

    const response = await post('https://example.com/badge.png');
    expect(response.status).toBe(400);
    // The first hop was fetched; the private redirect target was not.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a response that is not an allowed image type', async () => {
    mockFetch.mockResolvedValue(imageResponse('text/html'));
    const response = await post('https://example.com/not-an-image');
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'That URL is not a PNG, JPEG, or WebP image.',
    });
  });

  it('rejects an image larger than the cap', async () => {
    const huge = Buffer.alloc(9 * 1024 * 1024);
    mockFetch.mockResolvedValue(imageResponse('image/png', huge));
    const response = await post('https://example.com/huge.png');
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'That image is larger than 8 MB.' });
  });

  it('returns a same-origin data URL for a valid public image', async () => {
    mockFetch.mockResolvedValue(imageResponse('image/png', Buffer.from('abc')));
    const response = await post('https://example.com/badge.png');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      dataUrl: `data:image/png;base64,${Buffer.from('abc').toString('base64')}`,
    });
  });
});
