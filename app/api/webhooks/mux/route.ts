import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  return NextResponse.json(
    {
      payload,
      message: 'Mux webhook handling is not yet implemented.',
    },
    { status: 202 },
  );
}
