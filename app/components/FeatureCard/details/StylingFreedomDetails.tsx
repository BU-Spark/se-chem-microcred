import React from 'react';
import styles from '../FeatureCard.module.css'; // Import styles for the link

export const StylingFreedomDetails = () => {
  return (
    <>
      <p>
        This template does not impose a specific styling library, giving you flexibility.{' '}
        <a
          href="https://nextjs.org/docs/app/building-your-application/styling/css-modules"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.featureLink}
        >
          <strong>CSS Modules</strong>
        </a>{' '}
        are used for base components as a lightweight example.
      </p>
      <h4 className={styles.detailSubheading}>Popular Choices:</h4>
      <ul>
        <li className={styles.detailListItem}>
          <a href="https://tailwindcss.com" target="_blank" rel="noopener noreferrer" className={styles.featureLink}>
            Tailwind CSS
          </a>
        </li>
        <li className={styles.detailListItem}>
          <a href="https://emotion.sh" target="_blank" rel="noopener noreferrer" className={styles.featureLink}>
            Emotion
          </a>
        </li>
        <li className={styles.detailListItem}>
          <a
            href="https://styled-components.com"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.featureLink}
          >
            Styled Components
          </a>
        </li>
      </ul>
      <h4 className={styles.detailSubheading}>Component Libraries:</h4>
      <ul>
        <li className={styles.detailListItem}>
          <a href="https://mui.com" target="_blank" rel="noopener noreferrer" className={styles.featureLink}>
            Material UI
          </a>{' '}
          (Google&apos;s own component library)
        </li>
        <li className={styles.detailListItem}>
          <a href="https://chakra-ui.com" target="_blank" rel="noopener noreferrer" className={styles.featureLink}>
            Chakra UI
          </a>
        </li>
        <li className={styles.detailListItem}>
          <a href="https://mantine.dev" target="_blank" rel="noopener noreferrer" className={styles.featureLink}>
            Mantine
          </a>
        </li>
        <li className={styles.detailListItem}>
          <a href="https://radix-ui.com" target="_blank" rel="noopener noreferrer" className={styles.featureLink}>
            Radix UI
          </a>{' '}
          (Primitives)
        </li>
        <li className={styles.detailListItem}>
          <a href="https://ant.design/" target="_blank" rel="noopener noreferrer" className={styles.featureLink}>
            Ant Design
          </a>{' '}
          (Alibaba&apos;s affiliate component library)
        </li>
        <li className={styles.detailListItem}>
          <a href="https://ui.shadcn.com" target="_blank" rel="noopener noreferrer" className={styles.featureLink}>
            shadcn/ui
          </a>{' '}
          (Built with Radix primitives + Tailwind)
        </li>
      </ul>
    </>
  );
};
