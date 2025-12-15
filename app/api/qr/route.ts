export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import QRCode from 'qrcode';
import prisma from '../../../lib/prisma';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
type RateLimitEntry = { count: number; resetAt: number };

const rateLimitStore: Map<string, RateLimitEntry> =
  (globalThis as unknown as { __qrRateLimit?: Map<string, RateLimitEntry> }).__qrRateLimit ?? new Map();
(globalThis as unknown as { __qrRateLimit: Map<string, RateLimitEntry> }).__qrRateLimit = rateLimitStore;

type StudentBadgePayload = {
  studentId: string;
  badgeId: string;
};

function clampSize(size: number | null) {
  if (!size || !Number.isFinite(size)) return 360;
  return Math.min(Math.max(size, 64), 1024);
}

function getClientKey(request: Request) {
  const headerValue =
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    '';
  if (!headerValue) return 'anonymous';
  return headerValue.split(',')[0]?.trim() || 'anonymous';
}

function consumeRateLimit(request: Request) {
  const key = getClientKey(request);
  const now = Date.now();
  const existing = rateLimitStore.get(key);

  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true as const };
  }

  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { allowed: false as const, retryAfter };
  }

  existing.count += 1;
  return { allowed: true as const };
}

function parseStudentBadgePayload(raw: string | null): StudentBadgePayload | null {
  if (!raw) return null;
  const parts = raw
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  const map = parts.reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.split(':');
    if (key && rest.length > 0) {
      acc[key] = rest.join(':');
    }
    return acc;
  }, {});

  if (!map.student || !map.badge) {
    return null;
  }

  return { studentId: map.student, badgeId: map.badge };
}

async function authorizeStudentBadge(payload: StudentBadgePayload) {
  const clerkUser = await currentUser();
  if (!clerkUser || !clerkUser.emailAddresses?.[0]) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = clerkUser.emailAddresses[0].emailAddress.toLowerCase();
  const student = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!student) {
    return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  }

  if (student.id !== payload.studentId) {
    return NextResponse.json({ error: 'You can only generate QR codes for your own badges.' }, { status: 403 });
  }

  const ownsBadge = await prisma.studentBadge.findUnique({
    where: {
      studentId_badgeId: {
        studentId: payload.studentId,
        badgeId: payload.badgeId,
      },
    },
    select: { id: true },
  });

  if (!ownsBadge) {
    return NextResponse.json({ error: 'Badge is not assigned to this student.' }, { status: 403 });
  }

  return null;
}

async function resolveRequestContext(request: Request) {
  const rate = consumeRateLimit(request);
  if (!rate.allowed) {
    return {
      response: NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429, headers: rate.retryAfter ? { 'Retry-After': String(rate.retryAfter) } : undefined }
      ),
    };
  }

  const url = new URL(request.url);
  const data = url.searchParams.get('data');
  const sizeParam = Number.parseInt(url.searchParams.get('size') ?? '', 10);
  const size = clampSize(Number.isFinite(sizeParam) ? sizeParam : null);

  const payload = parseStudentBadgePayload(data);
  if (!payload) {
    return {
      response: NextResponse.json(
        { error: 'Invalid data payload. Expected student and badge identifiers.' },
        { status: 400 }
      ),
    };
  }

  const authError = await authorizeStudentBadge(payload);
  if (authError) {
    return { response: authError };
  }

  return { data: data as string, size };
}

async function buildQrResponse(request: Request, includeBody: boolean) {
  const context = await resolveRequestContext(request);
  if ('response' in context) {
    return context.response;
  }

  try {
    const png = await QRCode.toBuffer(context.data, {
      type: 'png',
      width: context.size,
      margin: 1,
      errorCorrectionLevel: 'M',
    });

    return new NextResponse(includeBody ? png : null, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(png.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Failed to generate QR code', error);
    return NextResponse.json({ error: 'Failed to generate QR code.' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return buildQrResponse(request, true);
}

export async function HEAD(request: Request) {
  return buildQrResponse(request, false);
}
