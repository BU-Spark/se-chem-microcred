import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  return NextResponse.json({
    id,
    exportUrl: null,
    message: 'Badge export is not yet implemented.',
  });
}
