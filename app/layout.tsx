/* eslint-disable @next/next/no-page-custom-font */
import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import './globals.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import checkedLogo from '../assets/checked_logo.png';
import Image from 'next/image';
import './globals.css';

const clerkPublishableKey =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY || 'pk_test_placeholder';

export const metadata: Metadata = {
  title: 'ChemSkills Demo',
  description: 'Student demo for micro-credential experience.',
  keywords: ['Chemistry', 'Micro-credential', 'Student Experience'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <html lang="en">
        <head>
          {/* 👇 Load Open Sans + Lato */}
          <link
            href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&family=Lato:wght@400;700&display=swap"
            rel="stylesheet"
          />
        </head>

        <body>
          <ErrorBoundary>
            {/* GLOBAL HEADER */}
            <header className="global-header">
              <Image src={checkedLogo} alt="checkd logo" className="global-logo" width={115} height={32} />
            </header>
            {/* PAGE CONTENT */}
            <div className="main-content-container">{children}</div>
          </ErrorBoundary>
        </body>
      </html>
    </ClerkProvider>
  );
}
