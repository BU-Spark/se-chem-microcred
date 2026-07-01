import { NextResponse } from 'next/server';

import { getPublicOrigin } from '@/lib/requestOrigin';
import prisma from '@/lib/prisma';

function normalizeAssessmentCode(value?: string | null) {
  const normalized = value?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return normalized && normalized.length > 0 ? normalized : null;
}

function buildPublicUrl(pathname: string, request: Request) {
  return new URL(pathname, getPublicOrigin(request));
}

function redirectHomeWithAssessmentNotice(
  request: Request,
  code: 'invalid' | 'denied' | 'not-ready',
  message = 'This assessment code is invalid or expired.'
) {
  const redirectUrl = buildPublicUrl('/', request);
  redirectUrl.searchParams.set('assessmentAccess', code);
  redirectUrl.searchParams.set('assessmentMessage', message);
  return NextResponse.redirect(redirectUrl);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = normalizeAssessmentCode(url.searchParams.get('code'));

  if (!code) {
    return redirectHomeWithAssessmentNotice(request, 'invalid', 'Enter a valid assessment code.');
  }

  const accessCode = await prisma.assessmentAccessCode.findUnique({
    where: { code },
  });

  if (!accessCode) {
    return redirectHomeWithAssessmentNotice(request, 'invalid', 'This assessment code was not found.');
  }

  if (accessCode.expiresAt <= new Date()) {
    await prisma.assessmentAccessCode.delete({ where: { id: accessCode.id } }).catch(() => undefined);
    return redirectHomeWithAssessmentNotice(request, 'invalid', 'This assessment code has expired.');
  }

  const redirectUrl = buildPublicUrl('/qr/assessment', request);
  redirectUrl.searchParams.set('courseId', accessCode.courseId);
  redirectUrl.searchParams.set('studentId', accessCode.studentId);
  redirectUrl.searchParams.set('badgeId', accessCode.badgeId);

  return NextResponse.redirect(redirectUrl);
}
