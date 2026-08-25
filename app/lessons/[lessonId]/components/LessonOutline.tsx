'use client';

import Image from 'next/image';

import type { LessonOutline as LessonOutlineModel } from '@/lib/lessonOutline';

import styles from './LessonOutline.module.css';

/**
 * Compact, ordered outline of the lesson: one row per video part with its
 * derived runtime, the checkpoint that gates it, and the closing survey. The
 * previous horizontal filmstrip needed ~450px of vertical space per row and
 * scrolled sideways; this reads top-to-bottom in a fixed-width column.
 */
export default function LessonOutline({ outline }: { outline: LessonOutlineModel }) {
  const stepCount = outline.parts.length + (outline.parts.length > 0 ? 1 : 0);

  if (outline.parts.length === 0) return null;

  return (
    <section className={styles.outline} aria-label="Lesson outline">
      <header className={styles.header}>
        <h2 className={styles.heading}>Lesson outline</h2>
        <p className={styles.subheading}>
          {stepCount} step{stepCount === 1 ? '' : 's'}, in order
          {outline.totalSeconds != null ? ` · ${outline.totalLabel} of video` : ''}
        </p>
      </header>

      <ol className={styles.steps}>
        {outline.parts.map((part) => (
          <li key={part.id} className={styles.step}>
            <div className={styles.partCard}>
              <div className={styles.thumb}>
                {part.thumbnailUrl ? (
                  <Image
                    src={part.thumbnailUrl}
                    alt=""
                    width={168}
                    height={95}
                    className={styles.thumbImg}
                    sizes="(max-width: 560px) 96px, 168px"
                  />
                ) : (
                  <span className={styles.thumbPlaceholder} aria-hidden="true">
                    ▶
                  </span>
                )}
              </div>
              <div className={styles.partText}>
                <span className={styles.partTitle}>{part.title}</span>
                <span className={styles.partDuration}>
                  {part.durationSeconds != null ? part.durationLabel : 'Length unavailable'}
                </span>
              </div>
            </div>

            {part.checkpoint ? (
              <p className={styles.checkpointRow}>
                <span className={styles.checkpointDot} aria-hidden="true" />
                <span className={styles.checkpointLabel}>Checkpoint</span>
                <span className={styles.checkpointMeta}>{part.checkpoint.questionLabel}</span>
              </p>
            ) : null}
          </li>
        ))}

        <li className={styles.endCard}>
          <div className={styles.endArt}>
            <Image
              src="/assets/lesson/lesson_preview/finish_logo.svg"
              alt=""
              width={32}
              height={32}
              className={styles.endArtImg}
            />
          </div>
          <div className={styles.partText}>
            <span className={styles.partTitle}>End of lesson</span>
            <span className={styles.partDuration}>One survey</span>
          </div>
        </li>
      </ol>
    </section>
  );
}
