import { NextRequest, NextResponse } from 'next/server';

interface SkillProgressContext {
  params: Promise<{ skillId: string }>;
}

export async function GET(_request: NextRequest, context: SkillProgressContext) {
  const { skillId } = await context.params;
  return NextResponse.json({
    skillId,
    status: 'pending',
    message: 'Progress tracking is not yet implemented.',
  });
}
