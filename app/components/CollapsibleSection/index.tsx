'use client';

import type { ReactNode } from 'react';

type CollapsibleSectionProps = {
  title: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  panelId: string;
  children: ReactNode;
  buttonClassName?: string;
  panelClassName?: string;
  chevronClassName?: string;
  chevronOpenClassName?: string;
};

export default function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  panelId,
  children,
  buttonClassName,
  panelClassName,
  chevronClassName,
  chevronOpenClassName,
}: CollapsibleSectionProps) {
  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        <span>{title}</span>
        <svg
          viewBox="0 0 16 16"
          width="18"
          height="18"
          aria-hidden="true"
          className={[chevronClassName, isOpen ? chevronOpenClassName : ''].filter(Boolean).join(' ')}
        >
          <path
            d="M3 6.25 8 11l5-4.75"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen ? (
        <div id={panelId} className={panelClassName}>
          {children}
        </div>
      ) : null}
    </>
  );
}
