import React from 'react';
import styles from '../FeatureCard.module.css'; // Assuming styles are needed for links/lists

export const ModernStackDetails = () => {
  return (
    <>
      <p className={styles.detailIntroParagraph}>
        This template utilizes a cutting-edge stack for building high-performance, scalable, and maintainable web
        applications.
      </p>

      {/* Next.js */}
      <h4 className={styles.detailSubheading}>
        <a href="https://nextjs.org" target="_blank" rel="noopener noreferrer" className={styles.featureLink}>
          <strong>Next.js (v15+)</strong>
        </a>
      </h4>
      <ul>
        <li className={styles.detailListItem}>React Framework: Server Components, App Router, API Route Handlers.</li>
        <li className={styles.detailListItem}>
          Optimized for speed: Images, fonts, scripts; excellent Core Web Vitals.
        </li>
        <li className={styles.detailListItem}>Industry standard for full-stack React: Great DX & performance.</li>
      </ul>

      {/* React */}
      <h4 className={styles.detailSubheading}>
        <a href="https://react.dev" target="_blank" rel="noopener noreferrer" className={styles.featureLink}>
          <strong>React (v19+)</strong>
        </a>
      </h4>
      <ul>
        <li className={styles.detailListItem}>
          Latest features:{' '}
          <a
            href="https://react.dev/reference/rsc/server-functions"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.featureLink}
          >
            <strong>Actions</strong>
          </a>
          ,{' '}
          <a
            href="https://react.dev/reference/react/useOptimistic"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.featureLink}
          >
            <strong>`useOptimistic`</strong>
          </a>
          , improved concurrency.
        </li>
        <li className={styles.detailListItem}>Component architecture: Promotes reusability & maintainability.</li>
        <li className={styles.detailListItem}>Leading UI library: Evolving, vast ecosystem & community.</li>
      </ul>

      {/* TypeScript */}
      <h4 className={styles.detailSubheading}>
        <a
          href="https://www.typescriptlang.org/"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.featureLink}
        >
          <strong>TypeScript</strong>
        </a>
      </h4>
      <ul>
        <li className={styles.detailListItem}>Typed JavaScript: Catches errors early, improves code quality.</li>
        <li className={styles.detailListItem}>Improves readability & maintainability; superior tooling.</li>
        <li className={styles.detailListItem}>Standard for larger JS projects: Enhances collaboration & robustness.</li>
      </ul>
    </>
  );
};
