'use client';

import type { ReactNode } from 'react';

import { useFocusTrap } from '../../hooks/useFocusTrap';
import styles from './QuestionModal.module.css';

// Focus-trapped modal shell for editing a checkpoint question. Content is
// supplied by the consuming step so question-specific fields stay co-located
// with the step that owns them.
export default function QuestionModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close question editor">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
