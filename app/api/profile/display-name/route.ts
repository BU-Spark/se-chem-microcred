import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

import { fetchUserByEmail } from '@/app/api/courses/lib/course-queries';

export async function GET() {
  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress?.trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await fetchUserByEmail(email);

  if (!user) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  });
}
