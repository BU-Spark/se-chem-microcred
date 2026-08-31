'use client';

import type { ReactNode } from 'react';

import Sidebar, { SIDEBAR_NAV } from '@/app/components/Navigation/Sidebar';

/**
 * The page frame: sidebar + content area, with the padding and gap that
 * globals.css `.main` owns. Compose this rather than hand-rolling
 * `.page > Sidebar + main`, so a new page cannot invent its own offsets.
 *
 * `pageClassName` / `mainClassName` are for page-specific PAINT only —
 * background, colour, font — never padding or gap. A page that genuinely needs
 * a different frame gets a named modifier in globals.css instead.
 */
export default function PageShell({
  displayName,
  onSignOut,
  isSigningOut,
  navItems = SIDEBAR_NAV,
  pageClassName,
  mainClassName,
  overlays,
  children,
}: {
  displayName: string;
  onSignOut: () => void;
  isSigningOut: boolean;
  navItems?: typeof SIDEBAR_NAV;
  pageClassName?: string;
  mainClassName?: string;
  overlays?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={pageClassName ? `page ${pageClassName}` : 'page'}>
      <Sidebar navItems={navItems} displayName={displayName} onSignOut={onSignOut} isSigningOut={isSigningOut} />

      <main className={mainClassName ? `main ${mainClassName}` : 'main'}>{children}</main>

      {overlays}
    </div>
  );
}
