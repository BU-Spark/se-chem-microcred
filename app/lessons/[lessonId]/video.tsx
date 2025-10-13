'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { YoutubePlayer } from '../../components/VideoPlayer/YoutubePlayer';
import { type LessonRecord } from '../../hooks/useStudentData';
import styles from './video.module.css';

type ModalType = 'none' | 'checkpoint' | 'checkpointResult' | 'lessonComplete';

interface LessonVideoPageProps {
  lesson: LessonRecord;
  studentName?: string | null;
}

function initialsFromName(name?: string | null) {
  if (!name) {
    return 'ST';
  }
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function extractYoutubeId(url?: string | null) {
  if (!url) {
    return null;
  }
  const longIdMatch = url.match(/[?&]v=([^&]+)/);
  if (longIdMatch?.[1]) {
    return longIdMatch[1];
  }
  const shortMatch = url.match(/youtu\.be\/([\w-]+)/);
  if (shortMatch?.[1]) {
    return shortMatch[1];
  }
  return null;
}

function normaliseQuestionOptions(options: unknown) {
  if (Array.isArray(options)) {
    return options.map((option) => String(option));
  }
  return [];
}

export function LessonVideoPage({ lesson, studentName = 'Student Demo' }: LessonVideoPageProps) {
  const [modalType, setModalType] = useState<ModalType>('checkpoint');
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});

  const initialSegmentIndex = useMemo(() => {
    const inProgressIndex = lesson.segments.findIndex((segment) => segment.status === 'IN_PROGRESS');
    if (inProgressIndex >= 0) {
      return inProgressIndex;
    }
    const completedLastIndex = lesson.segments.findIndex((segment) => segment.status === 'NOT_STARTED');
    if (completedLastIndex > 0) {
      return completedLastIndex - 1;
    }
    return 0;
  }, [lesson.segments]);

  const [activeSegmentIndex, setActiveSegmentIndex] = useState(initialSegmentIndex);

  useEffect(() => {
    setActiveSegmentIndex(initialSegmentIndex);
  }, [initialSegmentIndex]);

  useEffect(() => {
    setSelectedAnswers({});
    setModalType('checkpoint');
  }, [activeSegmentIndex]);

  const currentSegment = lesson.segments[activeSegmentIndex] ?? lesson.segments[0] ?? null;
  const currentCheckpoint =
    (currentSegment && lesson.checkpoints.find((checkpoint) => checkpoint.segmentId === currentSegment.id)) ??
    lesson.checkpoints[activeSegmentIndex] ??
    lesson.checkpoints[0] ??
    null;

  const timelineSegments = useMemo(() => {
    return lesson.segments.map((segment, index) => {
      const previousComplete =
        index < activeSegmentIndex || segment.status === 'COMPLETED' || segment.status === 'IN_PROGRESS';
      const isCurrent = index === activeSegmentIndex || segment.status === 'IN_PROGRESS';
      return {
        id: segment.id,
        title: segment.title || `Segment ${index + 1}`,
        thumbnail: segment.thumbnailUrl || lesson.thumbnailUrl,
        status: previousComplete ? (isCurrent ? 'current' : 'completed') : 'pending',
      } as const;
    });
  }, [lesson, activeSegmentIndex]);

  const currentVideoId = extractYoutubeId(currentSegment?.videoUrl) ?? 'zxQyTK8quyY';
  const [firstName, lastName] = useMemo(() => {
    const parts = studentName?.split(/\s+/).filter(Boolean) ?? ['Student', 'Demo'];
    return [parts[0] ?? 'Student', parts[parts.length - 1] ?? 'Demo'];
  }, [studentName]);

  const handleAnswerSelect = useCallback((questionId: string, answerIndex: number) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: answerIndex,
    }));
  }, []);

  const renderModal = useMemo(() => {
    if (modalType === 'none') {
      return null;
    }

    const questions = currentCheckpoint?.questions ?? [];

    if (modalType === 'lessonComplete') {
      return (
        <div className={styles.overlay}>
          <div className={styles.modalCard}>
            <h2 className={styles.modalTitle}>Lesson Completed</h2>
            <p className={styles.modalDescription}>
              You&apos;re almost there! Show your assessor the QR code and complete this survey to get checkd.
            </p>
            <button type="button" className={styles.modalPrimary}>
              Start Survey
            </button>
            <div className={styles.modalActions}>
              <button type="button" className={styles.modalSecondary}>
                Show QR code
              </button>
              <button type="button" className={styles.modalSecondary} onClick={() => setModalType('none')}>
                Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (modalType === 'checkpointResult' && currentCheckpoint) {
      return (
        <div className={styles.overlay}>
          <div className={styles.modalCard}>
            <h2 className={styles.modalTitle}>Checkpoint results</h2>
            <p className={styles.modalDescription}>Review how you did before moving on.</p>
            <ul className={styles.questionList}>
              {questions.map((question, index) => {
                const isCorrect = selectedAnswers[question.id] === question.correctIndex;
                return (
                  <li key={question.id}>
                    <span>
                      {isCorrect ? '✓' : '✗'} Question {index + 1}
                    </span>
                    <span className={styles.statusIcon}>{isCorrect ? '✓' : '✗'}</span>
                  </li>
                );
              })}
            </ul>
            <div className={styles.controlRow}>
              <button
                type="button"
                className={`${styles.controlButton} ${styles.controlButtonSecondary}`}
                onClick={() => setModalType('none')}
              >
                Rewatch
              </button>
              <button
                type="button"
                className={`${styles.controlButton} ${styles.controlButtonPrimary}`}
                onClick={() => {
                  setSelectedAnswers({});
                  setModalType('checkpoint');
                }}
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }

    const activeQuestion = questions[0];
    const questionOptions = normaliseQuestionOptions(activeQuestion?.options);

    return (
      <div className={styles.overlay}>
        <div className={styles.modalCard}>
          <h2 className={styles.modalTitle}>
            {currentCheckpoint ? currentCheckpoint.title : 'Checkpoint'}{' '}
            {activeQuestion ? `• Question 1/${questions.length}` : ''}
          </h2>
          <p className={styles.modalDescription}>{activeQuestion?.prompt ?? 'Checkpoint question coming soon.'}</p>
          <div className={styles.questionList}>
            {questionOptions.length ? (
              questionOptions.map((option, index) => (
                <button
                  type="button"
                  key={option}
                  className={`${styles.controlButton} ${
                    selectedAnswers[activeQuestion!.id] === index
                      ? styles.controlButtonPrimary
                      : styles.controlButtonSecondary
                  }`}
                  onClick={() => activeQuestion && handleAnswerSelect(activeQuestion.id, index)}
                >
                  {option}
                </button>
              ))
            ) : (
              <div style={{ color: '#4b5563' }}>Answer options will appear here.</div>
            )}
          </div>
          <div className={styles.controlRow}>
            <button
              type="button"
              className={`${styles.controlButton} ${styles.controlButtonSecondary}`}
              onClick={() => setModalType('none')}
            >
              Rewatch
            </button>
            <button
              type="button"
              className={`${styles.controlButton} ${styles.controlButtonPrimary}`}
              onClick={() => setModalType('checkpointResult')}
              disabled={!activeQuestion || selectedAnswers[activeQuestion.id] == null}
            >
              Submit
            </button>
          </div>
        </div>
      </div>
    );
  }, [modalType, currentCheckpoint, selectedAnswers, handleAnswerSelect]);

  return (
    <div className={styles.page}>
      <header className={styles.headerBar}>
        <div className={styles.logo}>
          checkd.<sup>®</sup>
        </div>
        <nav className={styles.headerNav}>
          <Link href="/analytics">My Analytics</Link>
          <Link href="/badges">Badge Wallet</Link>
          <Link href="/grades">Grades</Link>
          <Link href="/settings">Settings</Link>
        </nav>
        <div className={styles.userBadge}>
          <div className={styles.userAvatar}>{initialsFromName(studentName)}</div>
          <div>
            <div style={{ fontWeight: 600 }}>{firstName}</div>
            <div style={{ fontSize: '0.8rem', color: '#4b5563' }}>{lastName}</div>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        <aside className={styles.timeline}>
          {timelineSegments.map((segment, index) => {
            const isCompleted = segment.status === 'completed';
            const isActive = segment.status === 'current';
            return (
              <button
                type="button"
                key={segment.id}
                className={styles.timelineItem}
                onClick={() => setActiveSegmentIndex(index)}
              >
                <div
                  className={`${styles.timelineThumbnail} ${isCompleted ? styles.timelineThumbnailCompleted : ''} ${
                    isActive ? styles.timelineThumbnailActive : ''
                  }`}
                >
                  {segment.thumbnail ? (
                    <Image src={segment.thumbnail} alt={segment.title} width={72} height={72} unoptimized />
                  ) : (
                    <div className={styles.timelinePlaceholder}>Preview</div>
                  )}
                </div>
                <div
                  className={`${styles.timelineCheckpoint} ${isCompleted ? styles.timelineCheckpointCompleted : ''}`}
                >
                  {isCompleted ? '✓' : ''}
                </div>
              </button>
            );
          })}
        </aside>

        <div className={styles.mainColumn}>
          <div className={styles.videoHeader}>
            <h1 className={styles.videoTitle}>{lesson.title}</h1>
            <div className={styles.videoSegment}>{currentSegment?.title || 'Segment'}</div>
          </div>

          <div className={styles.videoWrapper}>
            <YoutubePlayer videoId={currentVideoId} />
            {renderModal}
          </div>
        </div>
      </div>
    </div>
  );
}
