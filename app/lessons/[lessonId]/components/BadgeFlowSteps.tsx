'use client';

import styles from './BadgeFlowSteps.module.css';

const STEPS = [
  { title: 'Watch the video', detail: 'Answer the checkpoints as you go.' },
  { title: 'Pass the in-person assessment', detail: 'A checker signs off on your skill.' },
  { title: 'Earn the badge', detail: 'It lands in your badge passport.' },
] as const;

/**
 * Lightweight three-step explainer for how a lesson turns into a badge.
 * Students kept asking what finishing the video actually unlocks, so the
 * lifecycle is stated on the overview instead of only in the badge flow.
 */
export default function BadgeFlowSteps() {
  return (
    <section className={styles.flow} aria-label="How you earn this badge">
      <p className={styles.eyebrow}>How you earn it</p>
      <ol className={styles.steps}>
        {STEPS.map((step, index) => (
          <li key={step.title} className={styles.step}>
            <span className={styles.marker} aria-hidden="true">
              {index + 1}
            </span>
            <span className={styles.stepText}>
              <span className={styles.stepTitle}>{step.title}</span>
              <span className={styles.stepDetail}>{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
