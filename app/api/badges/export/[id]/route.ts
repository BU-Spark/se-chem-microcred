import { NextRequest, NextResponse } from 'next/server';

interface BadgeExportContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: BadgeExportContext) {
  const { id } = await context.params;
  return NextResponse.json({
    id,
    exportUrl: null,
    message: 'Badge export is not yet implemented.',
  });
}
