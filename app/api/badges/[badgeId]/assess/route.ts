import { NextResponse } from 'next/server';

type RouteContext = {
  params: Promise<{
    badgeId: string;
  }>;
};

// DEPRECATED. This endpoint used to let a student self-advance a badge from
// READY_FOR_ASSESSMENT to the (now removed) READY_FOR_FINALIZATION state. Under the
// badge state machine (docs/badge-state-machine.md) an assessment is created by an
// assessor grading the rubric, which moves the badge to IN_REVIEW; the student then
// acknowledges (fail → feedback route) or acknowledges + rates (pass → survey route).
// It has no callers and is kept only to return an explicit gone response.
export async function POST(_request: Request, context: RouteContext) {
  const { badgeId } = await context.params;

  if (!badgeId) {
    return NextResponse.json({ error: 'Missing badge id.' }, { status: 400 });
  }

  return NextResponse.json(
    { error: 'Student self-finalization has been removed; assessments are submitted by an assessor.' },
    { status: 410 }
  );
}
