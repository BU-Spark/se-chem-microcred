import styles from '../page.module.css';

export default function SuccessModal({
  isEditMode,
  courseId,
  onClose,
}: {
  isEditMode: boolean;
  courseId: string | null;
  onClose: () => void;
}) {
  return (
    <div className={styles.successOverlay} role="dialog" aria-modal="true" aria-labelledby="badge-success-title">
      <div className={styles.successModal}>
        <button
          type="button"
          className={styles.successCloseButton}
          onClick={onClose}
          aria-label="Close success message"
        >
          x
        </button>
        <h2 id="badge-success-title" className={styles.successTitle}>
          Badge {isEditMode ? 'updated' : 'created'} successfully.
        </h2>
        <p className={styles.successText}>
          {isEditMode
            ? 'Your changes were saved to this badge.'
            : courseId
              ? 'This badge was created and assigned to the selected course.'
              : 'This badge was created independently and can be assigned to a course later.'}
        </p>
      </div>
    </div>
  );
}
