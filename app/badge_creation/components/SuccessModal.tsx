import Link from 'next/link';

import BadgeImage from '@/app/components/BadgeImage/BadgeImage';
import styles from '../page.module.css';

export default function SuccessModal({
  isEditMode,
  courseId,
  badgeName,
  imageUrl,
  imagePositionX,
  imagePositionY,
  imageScale,
  youtubeUrl,
  onClose,
}: {
  isEditMode: boolean;
  courseId: string | null;
  badgeName: string;
  imageUrl: string;
  imagePositionX: number;
  imagePositionY: number;
  imageScale: number;
  youtubeUrl: string;
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

        <div className={styles.successBadgeCircle} aria-hidden="true">
          <BadgeImage
            imageUrl={imageUrl}
            imagePositionX={imagePositionX}
            imagePositionY={imagePositionY}
            imageScale={imageScale}
            videoUrl={youtubeUrl}
            alt=""
          />
        </div>

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
