import { NextRequest, NextResponse } from 'next/server';
import dns from 'node:dns/promises';
import net from 'node:net';

import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';

const ALLOWED_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 8000;

/**
 * Private, loopback, link-local and other non-public ranges. Blocking these is
 * what stops a URL from being used to reach the host's own network -- cloud
 * metadata endpoints (169.254.169.254) above all.
 */
function isBlockedAddress(address: string) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }

  if (net.isIPv6(address)) {
    const value = address.toLowerCase();
    if (value === '::1' || value === '::') return true;
    if (value.startsWith('fe80')) return true; // link-local
    if (value.startsWith('fc') || value.startsWith('fd')) return true; // unique-local
    // IPv4-mapped (::ffff:10.0.0.1) has to be judged on the embedded address.
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    return false;
  }

  return true;
}

async function assertPublicHost(hostname: string) {
  // URL.hostname keeps the brackets on an IPv6 literal ("[::1]"), which net.isIP
  // does not recognise -- without stripping them the address would skip the
  // literal check entirely and be handed to the resolver as a hostname.
  const host = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;

  // A literal IP never reaches DNS, so check it directly before resolving.
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new Error('That address is not allowed.');
    return;
  }

  const records = await dns.lookup(host, { all: true }).catch(() => []);
  if (records.length === 0) throw new Error('Could not resolve that host.');
  // Every resolved address must be public: one bad record is enough to abuse.
  if (records.some((record) => isBlockedAddress(record.address))) {
    throw new Error('That address is not allowed.');
  }
}

/**
 * Follows redirects by hand so each hop's host can be re-validated. Letting fetch
 * follow them would check only the URL the caller gave us, and a public host is
 * free to redirect to a private one.
 */
async function fetchImage(rawUrl: string, signal: AbortSignal) {
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let url: URL;
    try {
      url = new URL(current);
    } catch {
      throw new Error('Enter a valid image URL.');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Image URLs must start with http:// or https://.');
    }
    await assertPublicHost(url.hostname);

    const response = await fetch(url, { redirect: 'manual', signal, headers: { Accept: 'image/*' } });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('That URL could not be followed.');
      current = new URL(location, url).toString();
      continue;
    }

    if (!response.ok) throw new Error(`That URL returned ${response.status}.`);
    return response;
  }

  throw new Error('That URL redirected too many times.');
}

export async function POST(request: NextRequest) {
  const user = await ensureCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { url?: unknown };
  const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
  if (!rawUrl) return NextResponse.json({ error: 'Enter an image URL.' }, { status: 400 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetchImage(rawUrl, controller.signal);

    const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return NextResponse.json({ error: 'That URL is not a PNG, JPEG, or WebP image.' }, { status: 400 });
    }

    // Content-Length is a hint, not a guarantee, so the buffer is checked too.
    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
      return NextResponse.json({ error: 'That image is larger than 8 MB.' }, { status: 400 });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'That image is larger than 8 MB.' }, { status: 400 });
    }
    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: 'That URL returned an empty image.' }, { status: 400 });
    }

    // Same-origin data URL: the client can now canvas-resize it without tainting.
    return NextResponse.json({ dataUrl: `data:${contentType};base64,${buffer.toString('base64')}` });
  } catch (error) {
    if (controller.signal.aborted) {
      return NextResponse.json({ error: 'That URL took too long to respond.' }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Could not load that image.';
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    clearTimeout(timeout);
  }
}
