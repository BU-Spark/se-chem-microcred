import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest, { params }: { params: { quizId: string } }) {
  const { quizId } = params;
  return NextResponse.json({
    quizId,
    message: 'Quiz retrieval is not yet implemented.',
  });
}
