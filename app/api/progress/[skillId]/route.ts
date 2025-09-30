import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest, { params }: { params: { skillId: string } }) {
  const { skillId } = params;
  return NextResponse.json({
    skillId,
    status: 'pending',
    message: 'Progress tracking is not yet implemented.',
  });
}
