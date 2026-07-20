'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';

import Modal from '../Modal';
import styles from './AssessmentCodeModal.module.css';

type AssessmentCodeModalProps = {
  badgeId: string;
  badgeName: string;
  courseId: string | null | undefined;
  studentId: string | null | undefined;
  onClose: () => void;
  variant?: 'wallet' | 'lesson';
};

export default function AssessmentCodeModal({
  badgeId,
  badgeName,
  courseId,
  studentId,
  onClose,
  variant = 'wallet',
}: AssessmentCodeModalProps) {
  const [assessmentCode, setAssessmentCode] = useState<string | null>(null);
  const [assessmentCodeError, setAssessmentCodeError] = useState<string | null>(null);

  const assessmentUrl = useMemo(() => {
    if (typeof window === 'undefined' || !courseId || !studentId) return null;

    const url = new URL('/qr/assessment', window.location.origin);
    url.searchParams.set('courseId', courseId);
    url.searchParams.set('studentId', studentId);
    url.searchParams.set('badgeId', badgeId);
    return url.toString();
  }, [badgeId, courseId, studentId]);

  useEffect(() => {
    if (!courseId) return;

    let isCancelled = false;
    fetch('/api/assessment-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, badgeId }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? 'Unable to create assessment code.');
        if (!isCancelled) setAssessmentCode(typeof payload.code === 'string' ? payload.code : null);
      })
      .catch((error) => {
        if (!isCancelled) {
          setAssessmentCodeError(error instanceof Error ? error.message : 'Unable to create assessment code.');
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [badgeId, courseId]);

  const isLesson = variant === 'lesson';

  return (
    <Modal
      onClose={onClose}
      overlayClassName={styles.overlay}
      className={`${styles.modal} ${isLesson ? styles.lessonModal : styles.walletModal}`}
      ariaLabel={`${badgeName} skill check`}
    >
      <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
        &times;
      </button>
      <h2 className={styles.title}>{badgeName} Skill Check</h2>
      {assessmentUrl ? (
        <div className={styles.qrFrame}>
          <div className={styles.qrCanvas}>
            {/* A browser image request carries the Clerk session required by the QR API. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/qr?size=360&data=${encodeURIComponent(assessmentUrl)}`}
              alt={`${badgeName} QR code`}
              width={360}
              height={360}
              className={styles.qrImage}
            />
            <div className={styles.qrLogo}>
              <Image
                src="/assets/badge_wallet/QR/qr_logo.svg"
                alt="Checkd logo"
                width={74}
                height={74}
                className={styles.qrLogoImage}
              />
            </div>
          </div>
        </div>
      ) : (
        <p className={styles.error}>
          We could not build the assessment QR code for this {isLesson ? 'lesson' : 'badge'}.
        </p>
      )}
      <div className={styles.codeBox}>
        <span className={styles.codeLabel}>Assessment code</span>
        <strong className={styles.codeValue}>{assessmentCode ?? 'Generating...'}</strong>
        {assessmentCodeError ? <p className={styles.codeError}>{assessmentCodeError}</p> : null}
      </div>
      <p className={styles.description}>
        {isLesson
          ? 'Have your assessor scan this code to open the assessment for this student and badge.'
          : "Show your assessor this QR code to complete the in-person assessment. Don't forget to bring your student ID for verification."}
      </p>
    </Modal>
  );
}
