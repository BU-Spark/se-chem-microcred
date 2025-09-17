'use client';

import styles from './FeatureCard.module.css';
import type { FeatureCardProps } from './FeatureCard.types';

export const FeatureCard = ({ id, icon, title, description, details, isExpanded, onClick }: FeatureCardProps) => {
  return (
    <div
      className={`${styles.featureCard} ${isExpanded ? styles.expanded : ''}`}
      onClick={() => onClick(id)}
      role="button"
      tabIndex={0} // For accessibility (keyboard focus)
      onKeyDown={(e) => {
        // For accessibility (keyboard activation)
        if (e.key === 'Enter' || e.key === ' ') {
          onClick(id);
        }
      }}
      aria-expanded={isExpanded}
      aria-controls={`details-${id}`}
    >
      <div className={styles.featureIcon}>{icon}</div>
      <h2 className={styles.featureTitle}>{title}</h2>
      <p className={styles.featureDescription}>{description}</p>
      <div
        id={`details-${id}`}
        className={`${styles.featureDetails} ${isExpanded ? styles.detailsVisible : ''}`}
        aria-hidden={!isExpanded}
      >
        {details}
      </div>
    </div>
  );
};
