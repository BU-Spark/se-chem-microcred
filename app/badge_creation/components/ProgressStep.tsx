import styles from '../page.module.css';

export default function ProgressStep({
  index,
  activeIndex,
  label,
}: {
  index: number;
  activeIndex: number;
  label: string;
}) {
  const isComplete = index < activeIndex;
  const isActive = index === activeIndex;

  return (
    <div className={styles.progressStep}>
      <div
        className={styles.progressDot}
        data-active={isActive ? 'true' : 'false'}
        data-complete={isComplete ? 'true' : 'false'}
      >
        {(isActive || isComplete) && <span className={styles.progressDotFill} />}
      </div>
      <span className={styles.progressLabel}>{label}</span>
    </div>
  );
}
