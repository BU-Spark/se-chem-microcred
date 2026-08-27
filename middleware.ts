import { NextResponse } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

import { PATHNAME_HEADER } from '@/lib/onboardingPaths';

const isPublicRoute = createRouteMatcher([
  '/',
  '/splash',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/qr/assessment(.*)',
  '/api/health',
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }

  // Carry the path down to server components: Next.js gives layouts no direct
  // access to the pathname, and the onboarding gate has to live in the root layout
  // because middleware runs on the edge runtime here and cannot reach Prisma.
  const headers = new Headers(request.headers);
  headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
