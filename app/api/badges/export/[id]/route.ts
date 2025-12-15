import { NextRequest, NextResponse } from 'next/server';
import { BadgeStatus } from '@prisma/client';
import prisma from '../../../../../lib/prisma';

interface BadgeExportContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: BadgeExportContext) {
  const { id } = await context.params;
  const email = request.nextUrl.searchParams.get('email')?.trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  }

  const studentBadge = await prisma.studentBadge.findUnique({
    where: {
      studentId_badgeId: {
        studentId: user.id,
        badgeId: id,
      },
    },
    include: {
      badge: true,
    },
  });

  if (!studentBadge) {
    return NextResponse.json({ error: 'Badge enrollment not found.' }, { status: 404 });
  }

  if (studentBadge.status !== BadgeStatus.COMPLETED) {
    return NextResponse.json({ error: 'Badge must be completed before exporting.' }, { status: 409 });
  }

  const issuedDate = studentBadge.awardedAt ?? new Date();
  const issuedOn = issuedDate.toISOString();

  const exportPayload = {
    credentialName: studentBadge.badge.name,
    credentialId: studentBadge.id,
    credentialUrl: `https://checkd.example.com/badges/${studentBadge.badge.slug}`,
    issuedOn,
    studentName: user.name ?? 'Student',
    studentEmail: user.email,
    issuer: {
      name: 'ChemSkills Microcredential',
      website: 'https://checkd.example.com',
    },
    description: studentBadge.badge.description,
    category: studentBadge.badge.category,
  };

  const issueYear = issuedDate.getUTCFullYear();
  const issueMonth = issuedDate.getUTCMonth() + 1; // 0-based → 1-based

  const linkedInUrl = new URL('https://www.linkedin.com/profile/add');
  linkedInUrl.searchParams.set('startTask', 'CERTIFICATION_NAME');
  linkedInUrl.searchParams.set('name', exportPayload.credentialName);

  linkedInUrl.searchParams.set('organizationId', '107084289');
  linkedInUrl.searchParams.set('issueYear', String(issueYear));
  linkedInUrl.searchParams.set('issueMonth', String(issueMonth));
  linkedInUrl.searchParams.set('certId', exportPayload.credentialId);
  linkedInUrl.searchParams.set('certUrl', exportPayload.credentialUrl);

  return NextResponse.json({
    exportPayload,
    linkedInUrl: linkedInUrl.toString(),
  });
}
