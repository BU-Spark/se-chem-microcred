'use client';

import { useRouter } from 'next/navigation';

import styles from './BackButton.module.css';

/**
 * Standardized back button (issue #64): one appearance, placement, and behavior
 * across every page. Place it top-left of the content, above the page title.
 *
 * Behavior precedence:
 *  - `onClick`  — staged flows (badge/course creation, onboarding) pass a handler
 *                 that steps back exactly ONE stage.
 *  - `href`     — go to a specific destination.
 *  - default    — `router.back()`, falling back to `fallbackHref` (or '/') when
 *                 there is no in-app history to pop.
 */
export default function BackButton({
  label = 'Back',
  onClick,
  href,
  fallbackHref = '/',
  disabled = false,
  inline = false,
  className,
}: {
  label?: string;
  onClick?: () => void;
  href?: string;
  fallbackHref?: string;
  disabled?: boolean;
  /** Drops the bottom margin for footer/step-nav rows (vs. top-left page use). */
  inline?: boolean;
  className?: string;
}) {
  const router = useRouter();

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (href) {
      router.push(href);
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  };

  const classes = [styles.backButton, inline ? styles.inline : '', className].filter(Boolean).join(' ');

  return (
    <button type="button" className={classes} onClick={handleClick} disabled={disabled} aria-label={label}>
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M15 5l-7 7 7 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>{label}</span>
    </button>
  );
}
