import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: { skillId: string } },
) {
  const { skillId } = params;
  return NextResponse.json({
    skillId,
    attempts: [],
    message: 'Skill attempt history is not yet implemented.',
  });
}

export async function POST(request: NextRequest, { params }: { params: { skillId: string } }) {
  const { skillId } = params;
  const payload = await request.json().catch(() => ({}));
  return NextResponse.json(
    {
      skillId,
      payload,
      message: 'Recording skill attempts is not yet implemented.',
    },
    { status: 202 },
  );
}
