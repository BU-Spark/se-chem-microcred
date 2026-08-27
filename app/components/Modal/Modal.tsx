'use client';

import type { MouseEvent, ReactNode } from 'react';

import { useFocusTrap } from '../../hooks/useFocusTrap';

type ModalProps = {
  children: ReactNode;
  onClose: () => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  overlayClassName?: string;
  className?: string;
  closeOnEscape?: boolean;
  closeOnOverlayClick?: boolean;
};

export default function Modal({
  children,
  onClose,
  ariaLabel,
  ariaLabelledBy,
  overlayClassName,
  className,
  closeOnEscape = true,
  closeOnOverlayClick = true,
}: ModalProps) {
  const modalRef = useFocusTrap<HTMLDivElement>(true, () => {
    if (closeOnEscape) onClose();
  });

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnOverlayClick && event.target === event.currentTarget) onClose();
  };

  return (
    <div className={overlayClassName} onClick={handleOverlayClick}>
      <div
        ref={modalRef}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
      >
        {children}
      </div>
    </div>
  );
}
