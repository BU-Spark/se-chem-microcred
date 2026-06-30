import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'chem-skills',
    timestamp: new Date().toISOString(),
  });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
