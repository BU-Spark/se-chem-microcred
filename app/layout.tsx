import type { Metadata } from 'next';
import './globals.css';
import { ErrorBoundary } from './components/ErrorBoundary';

export const metadata: Metadata = {
  title: 'ChemSkills Demo',
  description: 'Student demo for micro-credential experience.',
  keywords: ['Chemistry', 'Micro-credential', 'Student Experience'],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>
          <div className="main-content-container">{children}</div>
        </ErrorBoundary>
      </body>
    </html>
  );
}
