import React from 'react';
import styles from '../FeatureCard.module.css'; // Import styles for the link

export const DevToolsDetails = () => {
  return (
    <>
      {/* ESLint */}
      <h4 className={styles.detailSubheading}>
        <a href="https://eslint.org" target="_blank" rel="noopener noreferrer" className={styles.featureLink}>
          <strong>ESLint</strong>
        </a>
      </h4>
      <ul>
        <li className={styles.detailListItem}>Identifies & fixes code patterns, improving quality/consistency.</li>
        <li className={styles.detailListItem}>Configurable, plugins, instant editor feedback.</li>
        <li className={styles.detailListItem}>Maintains large codebases, enforces standards, reduces bugs.</li>
      </ul>

      {/* Prettier */}
      <h4 className={styles.detailSubheading}>
        <a href="https://prettier.io" target="_blank" rel="noopener noreferrer" className={styles.featureLink}>
          <strong>Prettier</strong>
        </a>
      </h4>
      <ul>
        <li className={styles.detailListItem}>Auto-formats code for consistent style.</li>
        <li className={styles.detailListItem}>
          Opinionated (minimal setup), multi-language, integrates with linters/Git.
        </li>
        <li className={styles.detailListItem}>Saves time, ends style debates, automates formatting.</li>
      </ul>

      {/* Husky */}
      <h4 className={styles.detailSubheading}>
        <a
          href="https://typicode.github.io/husky"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.featureLink}
        >
          <strong>Husky</strong>
        </a>
      </h4>
      <ul>
        <li className={styles.detailListItem}>Manages Git hooks to run scripts (linters, tests) pre-commit/push.</li>
        <li className={styles.detailListItem}>Simplifies hook setup, automates quality checks.</li>
        <li className={styles.detailListItem}>Automates pre-commit/push quality gates.</li>
      </ul>

      {/* Jest */}
      <h4 className={styles.detailSubheading}>
        <a href="https://jestjs.io" target="_blank" rel="noopener noreferrer" className={styles.featureLink}>
          <strong>Jest</strong>
        </a>
      </h4>
      <ul>
        <li className={styles.detailListItem}>JavaScript testing framework for unit/integration tests.</li>
        <li className={styles.detailListItem}>Fast, all-in-one (assertions, runner, mocking), snapshot testing.</li>
        <li className={styles.detailListItem}>Widely used for JS/React testing; easy & comprehensive.</li>
      </ul>

      {/* React Testing Library */}
      <h4 className={styles.detailSubheading}>
        <a
          href="https://testing-library.com/docs/react-testing-library/intro"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.featureLink}
        >
          <strong>React Testing Library</strong>
        </a>
      </h4>
      <ul>
        <li className={styles.detailListItem}>Tests React components via user interactions & accessibility.</li>
        <li className={styles.detailListItem}>Encourages maintainable, user-centric tests.</li>
        <li className={styles.detailListItem}>Popular for React component testing, promotes best practices.</li>
      </ul>
    </>
  );
};
