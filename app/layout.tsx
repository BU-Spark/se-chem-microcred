/* eslint-disable @next/next/no-page-custom-font */
import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import './globals.css';
import { ErrorBoundary } from './components/ErrorBoundary';

export const metadata: Metadata = {
  title: 'ChemSkills Demo',
  description: 'Student demo for micro-credential experience.',
  keywords: ['Chemistry', 'Micro-credential', 'Student Experience'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
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
            <div className="main-content-container">{children}</div>
          </ErrorBoundary>
        </body>
      </html>
    </ClerkProvider>
  );
}
