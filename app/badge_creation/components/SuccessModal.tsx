import Link from 'next/link';

import styles from '../page.module.css';

export default function SuccessModal({
  isEditMode,
  courseId,
  badgeName,
  onClose,
}: {
  isEditMode: boolean;
  courseId: string | null;
  badgeName: string;
  onClose: () => void;
}) {
  // The dialog's accessible name is set via aria-label so the visible heading can
  // read "Success!" (per the design) without changing the a11y contract.
  return (
    <div
      className={styles.successOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={`Badge ${isEditMode ? 'updated' : 'created'} successfully.`}
    >
      <div className={styles.successModal}>
        <button
          type="button"
          className={styles.successCloseButton}
          onClick={onClose}
          aria-label="Close success message"
        >
          ×
        </button>

        <h2 className={styles.successTitle}>Success!</h2>

        <div className={styles.successBadgeCircle} aria-hidden="true" />

        {badgeName ? <p className={styles.successBadgeName}>{badgeName}</p> : null}

        <p className={styles.successText}>
          {isEditMode
            ? 'Your changes were saved to this badge.'
            : courseId
              ? 'This badge was created and assigned to the selected course.'
              : 'This badge was created independently and can be assigned to a course later.'}
        </p>

        <Link href="/my_badges" className={styles.successButton}>
          Go to Badge Page
        </Link>
      </div>
    </div>
  );
}
