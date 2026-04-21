import { NextRequest, NextResponse } from 'next/server';

interface SkillRouteContext {
  params: Promise<{ skillId: string }>;
}

export async function GET(_request: NextRequest, context: SkillRouteContext) {
  const { skillId } = await context.params;
  return NextResponse.json({
    skillId,
    attempts: [],
    message: 'Skill attempt history is not yet implemented.',
  });
}

export async function POST(request: NextRequest, context: SkillRouteContext) {
  const { skillId } = await context.params;
  const payload = await request.json().catch(() => ({}));
  return NextResponse.json(
    {
      skillId,
      payload,
      message: 'Recording skill attempts is not yet implemented.',
    },
    { status: 202 }
  );
}
