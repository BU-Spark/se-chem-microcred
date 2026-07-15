'use client';

import type { ReactNode } from 'react';

import Modal from '../../components/Modal';
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
  return (
    <Modal overlayClassName={styles.overlay} className={styles.modal} onClose={onClose} ariaLabel={title}>
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close question editor">
          ×
        </button>
      </div>
      {children}
    </Modal>
  );
}
