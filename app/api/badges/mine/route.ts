import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    badges: [],
    message: 'Badge retrieval is not yet implemented.',
  });
}
