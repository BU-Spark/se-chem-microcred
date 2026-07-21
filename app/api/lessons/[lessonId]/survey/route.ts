import { NextResponse } from 'next/server';

type RouteContext = {
  params: Promise<{
    lessonId: string;
  }>;
};

// DEPRECATED. Lesson surveys were removed — QEV completion is now checkpoints +
// passing grade, finalized by the student's "Finish lesson" button, which posts to
// POST /api/lessons/[lessonId]/grade. This endpoint has no callers and only returns
// an explicit gone response.
export async function POST(_request: Request, context: RouteContext) {
  const { lessonId } = await context.params;

  if (!lessonId) {
    return NextResponse.json({ error: 'Missing lesson id.' }, { status: 400 });
  }

  return NextResponse.json(
    { error: 'Lesson surveys have been removed; finish a lesson via its grade endpoint.' },
    { status: 410 }
  );
}
