/* eslint-disable @next/next/no-page-custom-font */
import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import './globals.css';
import { DatabaseDisplayNameProvider } from './_components/DatabaseDisplayNameProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GlobalHeader } from './components/GlobalHeader'; // 👈 NEW

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
  throw new Error('Missing Clerk publishable key. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY environment variable.');
}

export const metadata: Metadata = {
  title: 'Checkd - Microcredentials for you',
  description: 'Checkd app',
  keywords: ['Chemistry', 'Micro-credential', 'Student Experience', 'Student', 'Instructor'],
};

// Every route is auth-gated and renders client-side from the Clerk session +
// search params, so there is nothing to statically prerender. Forcing dynamic
// rendering app-wide avoids the useSearchParams() CSR-bailout build errors.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <html lang="en">
        <head>
          <link
            href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&family=Lato:wght@400;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
            rel="stylesheet"
          />
        </head>

        <body>
          <ErrorBoundary>
            <DatabaseDisplayNameProvider>
              <GlobalHeader />
              <div className="main-content-container">{children}</div>
            </DatabaseDisplayNameProvider>
          </ErrorBoundary>
        </body>
      </html>
    </ClerkProvider>
  );
}
